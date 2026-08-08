import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderStatus } from './entities/work-order-status.enum';
import { Item } from '../items/entities/item.entity';
import { User } from '../users/entities/user.entity';
import { Bom } from '../items/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // WO-YYYYMMDD-0001 (문자열 채번 함수)
  private async generateOrderNumber(): Promise<string> {
    const prefix = 'WO';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const searchPrefix = `${prefix}-${dateStr}-`;

    const lastOrder = await this.workOrderRepository.findOne({
      where: { orderNumber: Like(`${searchPrefix}%`) },
      order: { orderNumber: 'DESC' },
    });

    let sequence = 1;
    if (lastOrder) {
      const lastSeqStr = lastOrder.orderNumber.split('-').pop();
      if (lastSeqStr) {
        sequence = parseInt(lastSeqStr, 10) + 1;
      }
    }

    const paddedSequence = String(sequence).padStart(4, '0');
    return `${searchPrefix}${paddedSequence}`;
  }

  // 1. 작업지시서 생성
  async create(createWorkOrderDto: CreateWorkOrderDto): Promise<WorkOrder> {
    const { orderNumber, itemId, assigneeId, ...rest } = createWorkOrderDto;

    const finalOrderNumber = orderNumber || (await this.generateOrderNumber());

    const existingOrder = await this.workOrderRepository.findOne({
      where: { orderNumber: finalOrderNumber },
    });

    if (existingOrder) {
      throw new BadRequestException(`이미 존재하는 작업지시 번호입니다: ${finalOrderNumber}`);
    }

    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
    }

    let assignee: User | null = null;
    if (assigneeId) {
      // 🎯 핵심 해결: User 엔티티의 id 타입(number)에 맞춰 assigneeId를 number로 형변환
      const numericAssigneeId = Number(assigneeId);
      assignee = await this.userRepository.findOne({ where: { id: numericAssigneeId } });
      if (!assignee) {
        throw new NotFoundException(`ID가 ${assigneeId}인 담당자를 찾을 수 없습니다.`);
      }
    }

    const workOrder = this.workOrderRepository.create({
      orderNumber: finalOrderNumber,
      item,
      assignee,
      ...rest,
    });

    return await this.workOrderRepository.save(workOrder);
  }

  // 2. 전체 작업지시서 목록 조회
  async findAll(): Promise<WorkOrder[]> {
    return await this.workOrderRepository.find({
      relations: ['item', 'assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  // 3. 단일 작업지시서 상세 조회
  async findOne(id: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: ['item', 'assignee'],
    });
    if (!workOrder) {
      throw new NotFoundException(`ID가 ${id}인 작업지시서를 찾을 수 없습니다.`);
    }
    return workOrder;
  }

  // 4. 작업지시서 상태 및 생산 수량 변경 (COMPLETED 시 BOM 차감 및 완제품 가산)
  async update(id: string, updateWorkOrderDto: UpdateWorkOrderDto): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);
    const previousStatus = workOrder.status;
    const targetStatus = updateWorkOrderDto.status;

    if (previousStatus === WorkOrderStatus.COMPLETED && targetStatus === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('이미 완료된 작업지시서입니다.');
    }

    if (targetStatus === WorkOrderStatus.COMPLETED) {
      const producedQty = updateWorkOrderDto.producedQuantity ?? workOrder.targetQuantity;

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const boms = await queryRunner.manager.find(Bom, {
          where: { parentItem: { id: workOrder.item.id } },
          relations: ['childItem'],
        });

        for (const bom of boms) {
          const requiredQty = Number(bom.quantity) * producedQty;

          let childInventory = await queryRunner.manager.findOne(Inventory, {
            where: { item: { id: bom.childItem.id } },
          });

          if (!childInventory) {
            childInventory = queryRunner.manager.create(Inventory, {
              item: bom.childItem,
              quantity: 0,
            });
          }

          if (childInventory.quantity < requiredQty) {
            throw new BadRequestException(
              `원자재 재고 부족: [${bom.childItem.name}] 필요 수량: ${requiredQty}, 현재 재고: ${childInventory.quantity}`,
            );
          }

          childInventory.quantity -= requiredQty;
          await queryRunner.manager.save(childInventory);
        }

        let parentInventory = await queryRunner.manager.findOne(Inventory, {
          where: { item: { id: workOrder.item.id } },
        });

        if (!parentInventory) {
          parentInventory = queryRunner.manager.create(Inventory, {
            item: workOrder.item,
            quantity: 0,
          });
        }

        parentInventory.quantity += producedQty;
        await queryRunner.manager.save(parentInventory);

        workOrder.status = WorkOrderStatus.COMPLETED;
        workOrder.producedQuantity = producedQty;
        const savedWorkOrder = await queryRunner.manager.save(workOrder);

        await queryRunner.commitTransaction();
        return savedWorkOrder;
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
    }

    if (updateWorkOrderDto.status !== undefined) {
      workOrder.status = updateWorkOrderDto.status;
    }
    if (updateWorkOrderDto.producedQuantity !== undefined) {
      workOrder.producedQuantity = updateWorkOrderDto.producedQuantity;
    }

    return await this.workOrderRepository.save(workOrder);
  }
}