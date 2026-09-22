import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { GetPurchaseOrdersFilterDto } from './dto/get-purchase-orders-filter.dto';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { resolveOptionalPagination } from '../common/dto/optional-pagination-query.dto';

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const supplier = await this.dataSource.getRepository(Supplier).findOne({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(`ID가 ${dto.supplierId}인 공급업체를 찾을 수 없습니다.`);
    }

    const item = await this.dataSource.getRepository(Item).findOne({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const po = this.poRepository.create({
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      notes: dto.notes,
      supplier,
      item,
    });

    return await this.poRepository.save(po);
  }

  async findAll(filter?: GetPurchaseOrdersFilterDto): Promise<PurchaseOrder[]> {
    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.item', 'item')
      .leftJoinAndSelect('po.shipment', 'shipment')
      .orderBy('po.id', 'DESC');

    if (filter?.status) {
      qb.andWhere('po.status = :status', { status: filter.status });
    }
    if (filter?.itemId) {
      qb.andWhere('po.itemId = :itemId', { itemId: filter.itemId });
    }
    if (filter?.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: filter.supplierId });
    }
    if (filter?.startDate) {
      qb.andWhere('po.createdAt >= :startDate', { startDate: filter.startDate });
    }
    if (filter?.endDate) {
      // PR-116: 날짜만(YYYY-MM-DD) 들어오면 그날 하루 전체를 포함해야 한다 — createdAt은 시각이
      // 있는 값이라 `<= 'YYYY-MM-DD'`(=자정)로 비교하면 종료일 당일 발주가 전부 빠진다.
      if (/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate)) {
        const next = new Date(`${filter.endDate}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        qb.andWhere('po.createdAt < :endExclusive', { endExclusive: next.toISOString().slice(0, 10) });
      } else {
        qb.andWhere('po.createdAt <= :endDate', { endDate: filter.endDate });
      }
    }

    // PR-127: 발주 검색 선택(입출금전표의 "관련 발주 연결" 등)용 — 품목명/코드/공급업체명 부분일치(LOWER() LIKE LOWER()라 SQLite/PostgreSQL 동일).
    const keyword = filter?.keyword?.trim();
    if (keyword) {
      qb.andWhere(
        '(LOWER(item.name) LIKE LOWER(:kw) OR LOWER(item.code) LIKE LOWER(:kw) OR LOWER(supplier.name) LIKE LOWER(:kw))',
        { kw: `%${keyword}%` },
      );
    }

    // PR-127: DTO에 page/limit가 정의돼 있는데도 예전엔 skip/take를 안 걸어 항상 전량이 반환됐다. page 또는 limit를 명시하면 실제로 적용하고,
    // 둘 다 없으면(원장/리포트 등 전량을 기대하는 기존 호출부) 기존처럼 전량을 반환한다.
    const paging = resolveOptionalPagination(filter);
    if (paging) {
      qb.skip(paging.skip).take(paging.take);
    }

    return qb.getMany();
  }

  async findOne(id: number): Promise<PurchaseOrder> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: ['supplier', 'item', 'shipment'],
    });
    if (!po) {
      throw new NotFoundException(`ID가 ${id}인 구매 주문을 찾을 수 없습니다.`);
    }
    return po;
  }

  async updateStatus(id: number, dto: UpdatePurchaseOrderStatusDto): Promise<PurchaseOrder> {
    if (dto.status === PurchaseOrderStatus.RECEIVED) {
      return await this.receiveWithInventorySync(id);
    }

    const po = await this.findOne(id);
    po.status = dto.status;
    return await this.poRepository.save(po);
  }

  // 발주 입고(RECEIVED) 처리 - Inventory 반영을 QueryRunner 트랜잭션으로 묶어 처리
  private async receiveWithInventorySync(id: number): Promise<PurchaseOrder> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const po = await queryRunner.manager.findOne(PurchaseOrder, {
        where: { id },
        relations: ['supplier', 'item', 'shipment'],
      });
      if (!po) {
        throw new NotFoundException(`ID가 ${id}인 구매 주문을 찾을 수 없습니다.`);
      }

      if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException(
          `이미 ${po.status} 상태인 발주는 다시 입고 처리할 수 없습니다. (PO ID: ${po.id})`,
        );
      }

      // inventories.service.ts의 stockIn()과 동일한 비관적 락 패턴 재사용.
      // SQLite 드라이버는 pessimistic_write 락 자체를 지원하지 않아(LockNotSupportedOnGivenDriverError)
      // 개발용 sqlite 연결에서는 락 없이 조회한다 - 프로덕션 대상인 Postgres에서는 그대로 락을 건다.
      const supportsRowLock = this.dataSource.options.type !== 'sqlite';
      if (!supportsRowLock) {
        this.logger.warn(
          `SQLite 드라이버는 pessimistic_write 락을 지원하지 않아 락 없이 조회합니다 (PO ID: ${po.id}). 프로덕션(Postgres)에서는 정상적으로 락이 적용됩니다.`,
        );
      }
      let inventory = await queryRunner.manager.findOne(Inventory, {
        where: { itemId: po.itemId },
        ...(supportsRowLock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });

      if (!inventory) {
        inventory = queryRunner.manager.create(Inventory, {
          itemId: po.itemId,
          quantity: po.quantity,
        });
      } else {
        inventory.quantity += po.quantity;
      }
      await queryRunner.manager.save(Inventory, inventory);

      po.status = PurchaseOrderStatus.RECEIVED;
      const updated = await queryRunner.manager.save(PurchaseOrder, po);

      await queryRunner.commitTransaction();
      return updated;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const error = err as Error;
      this.logger.error(`발주 입고 처리 실패 (PO ID: ${id}): ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(id: number): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    const currentStatus = String(po.status);
    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      throw new BadRequestException('이미 완료되었거나 취소된 주문은 취소할 수 없습니다.');
    }

    po.status = 'CANCELLED' as any;
    return await this.poRepository.save(po);
  }

  async remove(id: number): Promise<void> {
    const po = await this.findOne(id);
    await this.poRepository.remove(po);
  }
}