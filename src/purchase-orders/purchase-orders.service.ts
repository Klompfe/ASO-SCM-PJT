import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';

export interface CreatePurchaseOrderInput {
  itemId: number;
  quantity: number;
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
    const item = await this.itemRepository.findOne({ where: { id: dto.itemId } });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const po = this.poRepository.create({
      itemId: dto.itemId,
      quantity: dto.quantity,
      status: PurchaseOrderStatus.PENDING,
    });

    return await this.poRepository.save(po);
  }

  async findAll(query?: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 10);
    const skip = (page - 1) * limit;

    const queryBuilder = this.poRepository.createQueryBuilder('po');

    if (query?.status) {
      queryBuilder.andWhere('po.status = :status', { status: query.status });
    }

    queryBuilder
      .orderBy('po.id', 'DESC')
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

  async findOne(id: number): Promise<PurchaseOrder> {
    const po = await this.poRepository.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`ID가 ${id}인 발주서를 찾을 수 없습니다.`);
    }
    return po;
  }

  async updateStatus(id: number, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('이미 처리 완료되거나 취소된 발주서의 상태는 변경할 수 없습니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      po.status = status;
      const updatedPo = await queryRunner.manager.save(po);

      if (status === PurchaseOrderStatus.RECEIVED) {
        let inventory = (await queryRunner.manager.findOne(Inventory, {
          where: { itemId: po.itemId } as any,
        })) as Inventory | null;

        if (!inventory) {
          inventory = queryRunner.manager.create(Inventory, {
            itemId: po.itemId,
            quantity: 0,
          });
        }

        inventory.quantity += po.quantity;
        await queryRunner.manager.save(inventory);
      }

      await queryRunner.commitTransaction();
      return updatedPo;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const error = err as Error;
      this.logger.error(`Failed to update PO status: ${error.message}`, error.stack);
      throw new InternalServerErrorException('발주서 상태 변경 중 오류가 발생했습니다.');
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(id: number): Promise<PurchaseOrder> {
    return await this.updateStatus(id, PurchaseOrderStatus.CANCELLED);
  }
}