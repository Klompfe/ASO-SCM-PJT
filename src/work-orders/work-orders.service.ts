import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { WorkOrderStatus } from './entities/work-order-status.enum';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 작업 지시서 생성
   */
  async create(createWorkOrderDto: CreateWorkOrderDto) {
    const { itemId, quantity } = createWorkOrderDto;

    const item = await this.itemRepository.findOne({
      where: { id: +itemId },
    });

    if (!item) {
      throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
    }

    const workOrder = this.workOrderRepository.create({
      item,
      quantity: +quantity,
      status: WorkOrderStatus.PENDING,
    });

    return await this.workOrderRepository.save(workOrder);
  }

  /**
   * 작업 지시서 전체 목록 조회
   */
  async findAll() {
    return await this.workOrderRepository.find({
      relations: ['item'],
    });
  }

  /**
   * 작업 지시서 단일 상세 조회
   */
  async findOne(id: string) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: ['item'],
    });

    if (!workOrder) {
      throw new NotFoundException(`ID가 ${id}인 작업 지시서를 찾을 수 없습니다.`);
    }

    return workOrder;
  }

  /**
   * 작업 지시서 수정 및 COMPLETED 전환 시 재고 연동 트랜잭션 처리
   */
  async update(id: string, updateWorkOrderDto: UpdateWorkOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 트랜잭션 내에서 기존 작업 지시서 조회
      const workOrder = await queryRunner.manager.findOne(WorkOrder, {
        where: { id },
        relations: ['item'],
      });

      if (!workOrder) {
        throw new NotFoundException(`ID가 ${id}인 작업 지시서를 찾을 수 없습니다.`);
      }

      // 2. 이미 완료 또는 취소된 작업 지시서의 수정 방지
      if (
        workOrder.status === WorkOrderStatus.COMPLETED ||
        workOrder.status === WorkOrderStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `이미 ${workOrder.status} 상태인 작업 지시서는 변경할 수 없습니다.`,
        );
      }

      // 3. 완료 상태로 전환되는지 체크
      const isChangingToCompleted =
        updateWorkOrderDto.status === WorkOrderStatus.COMPLETED;

      // DTO 데이터 반영
      if (updateWorkOrderDto.quantity) {
        workOrder.quantity = +updateWorkOrderDto.quantity;
      }
      if (updateWorkOrderDto.status) {
        workOrder.status = updateWorkOrderDto.status;
      }

      // 4. COMPLETED 전환 시 재고(Inventory) 수량 증감 처리
      if (isChangingToCompleted) {
        let inventory = await queryRunner.manager.findOne(Inventory, {
          where: { item: { id: workOrder.item.id } },
        });

        if (!inventory) {
          inventory = queryRunner.manager.create(Inventory, {
            item: workOrder.item,
            quantity: workOrder.quantity,
          });
        } else {
          inventory.quantity += workOrder.quantity;
        }

        await queryRunner.manager.save(inventory);
      }

      // 5. 작업 지시서 업데이트
      const updatedWorkOrder = await queryRunner.manager.save(workOrder);

      // 6. 성공 시 커밋
      await queryRunner.commitTransaction();
      return updatedWorkOrder;

    } catch (error: any) {
      // 7. 실패 시 롤백 및 에러 핸들링
      await queryRunner.rollbackTransaction();

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `작업 지시서 업데이트 및 재고 연동 실패: ${errorMessage}`,
      );
    } finally {
      // 8. Connection 해제
      await queryRunner.release();
    }
  }
}