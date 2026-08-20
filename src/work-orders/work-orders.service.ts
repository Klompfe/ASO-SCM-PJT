import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { Bom } from '../boms/entities/bom.entity';
import { Item } from '../items/entities/item.entity';

export interface CreateWorkOrderInput {
  itemId?: number;
  productId?: number;
  targetQuantity: number;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly woRepository: Repository<WorkOrder>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateWorkOrderInput): Promise<WorkOrder> {
    const targetItemId = dto.itemId || dto.productId;
    if (!targetItemId) {
      throw new BadRequestException('완제품 품목 ID가 필요합니다.');
    }

    const item = await this.itemRepository.findOne({ where: { id: targetItemId } });
    if (!item) {
      throw new NotFoundException(`ID가 ${targetItemId}인 완제품을 찾을 수 없습니다.`);
    }

    const newWo = new WorkOrder();
    newWo.itemId = targetItemId;
    newWo.targetQuantity = dto.targetQuantity;
    newWo.status = WorkOrderStatus.PENDING;

    return await this.woRepository.save(newWo);
  }

  async findAll(query?: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 10);
    const skip = (page - 1) * limit;

    const queryBuilder = this.woRepository.createQueryBuilder('wo');

    if (query?.status) {
      queryBuilder.andWhere('wo.status = :status', { status: query.status });
    }

    queryBuilder
      .orderBy('wo.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<WorkOrder> {
    const wo = await this.woRepository.findOne({ where: { id } });
    if (!wo) {
      throw new NotFoundException(`ID가 ${id}인 작업 지시서를 찾을 수 없습니다.`);
    }
    return wo;
  }

  async updateStatus(id: number, status: WorkOrderStatus): Promise<WorkOrder> {
    const wo = await this.findOne(id);

    if (wo.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('이미 완료된 작업 지시서입니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      wo.status = status;
      const updatedWo = await queryRunner.manager.save(wo);

      if (status === WorkOrderStatus.COMPLETED) {
        const boms = await queryRunner.manager.find(Bom, {
          where: { parentItemId: wo.itemId },
        });

        for (const bom of boms) {
          const requiredQty = bom.quantity * wo.targetQuantity;
          let rawInventory = (await queryRunner.manager.findOne(Inventory, {
            where: { itemId: bom.childItemId } as any,
          })) as Inventory | null;

          if (!rawInventory || rawInventory.quantity < requiredQty) {
            throw new BadRequestException(`원자재(ID: ${bom.childItemId}) 재고가 부족합니다.`);
          }

          rawInventory.quantity -= requiredQty;
          await queryRunner.manager.save(rawInventory);
        }

        let finishedInventory = (await queryRunner.manager.findOne(Inventory, {
          where: { itemId: wo.itemId } as any,
        })) as Inventory | null;

        if (!finishedInventory) {
          finishedInventory = queryRunner.manager.create(Inventory, {
            itemId: wo.itemId,
            quantity: 0,
          });
        }

        finishedInventory.quantity += wo.targetQuantity;
        await queryRunner.manager.save(finishedInventory);
      }

      await queryRunner.commitTransaction();
      return updatedWo;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const error = err as Error;
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to update WO status: ${error.message}`, error.stack);
      throw new InternalServerErrorException('작업 지시 상태 변경 중 오류가 발생했습니다.');
    } finally {
      await queryRunner.release();
    }
  }
}