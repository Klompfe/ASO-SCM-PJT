import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ProductionType } from '../styles/entities/style-overview.entity';
import { OrderTypeSuggestion, suggestOrderType } from './utils/purchase-order-type.util';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
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

  // PR-176: 라인이 있으면 총수량 = 라인 합계. 라인이 없으면 quantity를 필수로 쓴다(기존 동작).
  // 라인과 quantity가 둘 다 오고 값이 다르면 경고로 알리고 라인 합계를 쓴다(조용히 틀리지 않게).
  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder & { warnings: string[] }> {
    const lines = dto.lines ?? [];
    const warnings: string[] = [];
    let quantity: number;
    if (lines.length > 0) {
      quantity = lines.reduce((sum, l) => sum + l.qty, 0);
      if (dto.quantity !== undefined && dto.quantity !== quantity) {
        warnings.push(`입력한 총수량(${dto.quantity})과 색상/사이즈 라인 합계(${quantity})가 달라 라인 합계로 저장했습니다.`);
      }
    } else {
      if (dto.quantity === undefined) {
        throw new BadRequestException('색상/사이즈 라인이 없으면 주문 수량(quantity)을 입력해야 합니다.');
      }
      quantity = dto.quantity;
    }

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
      quantity,
      unitPrice: dto.unitPrice,
      orderType: dto.orderType ?? null,
      notes: dto.notes,
      supplier,
      item,
      lines: lines.map((l) => ({ color: l.color ?? null, size: l.size ?? null, qty: l.qty })),
    });

    const saved = await this.poRepository.save(po);
    return Object.assign(saved, { warnings });
  }

  // PR-173: 발주 생성 폼이 선택된 품목의 스타일 생산유형(CMT/FOB)을 알아야
  // 단가 필수 여부를 판단할 수 있다 — packing-receipts.service.ts의
  // resolveBomItemOrFail()/export-shipments.service.ts generate()와 동일하게
  // PO.itemId → BomItem.material → bom.style(.overview)로 거슬러 올라간다.
  // BOM에 연결되지 않은 자재는 생산유형을 알 수 없으므로 null을 돌려주고,
  // 호출자(프론트)는 이를 FOB와 동일하게(단가 필수) 취급한다(안전한 기본값).
  async getMaterialProductionContext(
    itemId: number,
  ): Promise<{ styleNo: string | null; productionType: string | null }> {
    const bomItem = await this.dataSource.getRepository(BomItem).findOne({
      where: { material: { id: itemId } },
      relations: ['bom', 'bom.style', 'bom.style.overview'],
      order: { id: 'DESC' },
    });
    if (!bomItem) {
      return { styleNo: null, productionType: null };
    }
    return {
      styleNo: bomItem.bom.style.styleNo ?? null,
      productionType: bomItem.bom.style.overview?.productionType ?? null,
    };
  }

  // PR-179: 일괄발주. 모든 행의 공급업체/품목을 먼저 확인해 하나라도 없으면 아무것도 쓰지 않고
  // 404로 끝낸다(절반만 생성되는 일을 막는다). 통과하면 한 트랜잭션으로 행마다 단건 생성과 같은 필드를 저장한다.
  async createBulk(dtos: CreatePurchaseOrderDto[]): Promise<PurchaseOrder[]> {
    const supplierIds = [...new Set(dtos.map((d) => d.supplierId))];
    const itemIds = [...new Set(dtos.map((d) => d.itemId))];
    const suppliers = await this.dataSource.getRepository(Supplier).findBy({ id: In(supplierIds) });
    const items = await this.dataSource.getRepository(Item).findBy({ id: In(itemIds) });
    const missingSupplier = supplierIds.filter((id) => !suppliers.some((s) => s.id === id));
    const missingItem = itemIds.filter((id) => !items.some((i) => i.id === id));
    if (missingSupplier.length || missingItem.length) {
      throw new NotFoundException(
        `존재하지 않는 값이 있어 일괄발주를 중단했습니다. 공급업체: [${missingSupplier.join(', ')}] 품목: [${missingItem.join(', ')}]`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const created: PurchaseOrder[] = [];
      for (const dto of dtos) {
        const po = queryRunner.manager.create(PurchaseOrder, {
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          orderType: dto.orderType ?? null,
          notes: dto.notes,
          supplier: suppliers.find((s) => s.id === dto.supplierId),
          item: items.find((i) => i.id === dto.itemId),
        });
        created.push(await queryRunner.manager.save(PurchaseOrder, po));
      }
      await queryRunner.commitTransaction();
      return created;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // PR-180: 품목의 발주 구분 제안. 발주에는 스타일 연결이 없으므로 이 품목을 쓰는 활성 BOM의 스타일 계약방식으로 정한다.
  async suggestOrderTypeForItem(itemId: number): Promise<OrderTypeSuggestion & { styleNos: string[] }> {
    const rows = await this.dataSource
      .getRepository(BomItem)
      .createQueryBuilder('bi')
      .innerJoin('bi.bom', 'bom')
      .innerJoin('bom.style', 'style')
      .leftJoin('style.overview', 'overview')
      .select('style.styleNo', 'styleNo')
      .addSelect('overview.productionType', 'productionType')
      .where('bi.materialId = :itemId', { itemId })
      .andWhere('bom.isActive = :active', { active: true })
      .getRawMany<{ styleNo: string; productionType: ProductionType | null }>();
    const byStyle = new Map<string, ProductionType | null>();
    for (const r of rows) byStyle.set(r.styleNo, r.productionType ?? null);
    return {
      ...suggestOrderType([...byStyle.values()]),
      styleNos: [...byStyle.keys()],
    };
  }

  async findAll(filter?: GetPurchaseOrdersFilterDto): Promise<PurchaseOrder[]> {
    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.item', 'item')
      .leftJoinAndSelect('po.shipment', 'shipment')
      .leftJoinAndSelect('po.lines', 'lines')
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
      relations: ['supplier', 'item', 'shipment', 'lines'],
    });
    if (!po) {
      throw new NotFoundException(`ID가 ${id}인 구매 주문을 찾을 수 없습니다.`);
    }
    return po;
  }

  // PR-177: 미입고(PENDING) 발주만 수정할 수 있다. 입고/취소된 발주는 이미 재고·거래에
  // 반영됐으므로 조용히 고치지 않고 400으로 막는다.
  async update(id: number, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== PurchaseOrderStatus.PENDING) {
      throw new BadRequestException(`미입고(PENDING) 상태인 발주만 수정할 수 있습니다. 현재 상태: ${po.status}`);
    }
    if (dto.quantity !== undefined) po.quantity = dto.quantity;
    if (dto.unitPrice !== undefined) po.unitPrice = dto.unitPrice;
    if (dto.notes !== undefined) po.notes = dto.notes;
    return await this.poRepository.save(po);
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