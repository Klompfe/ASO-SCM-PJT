import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { Item } from '../items/entities/item.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { calculateMaterialRequirements } from './utils/material-requirements.util';
import { pickActiveBom } from '../boms/utils/active-bom.util';

const EMPTY_REQUIREMENTS = {
  rows: [] as ReturnType<typeof calculateMaterialRequirements>,
  totals: { materialCount: 0, shortageMaterialCount: 0 },
  bom: null as { id: number; bomNo: string; version: string; isActive: boolean } | null,
  bomCount: 0,
};

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly woRepository: Repository<WorkOrder>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const item = await this.dataSource.getRepository(Item).findOne({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const wo = this.woRepository.create({
      targetQuantity: dto.targetQuantity,
      item,
    });

    return await this.woRepository.save(wo);
  }

  async findAll(filter?: GetWorkOrdersFilterDto) {
    const page = filter?.page || 1;
    const limit = filter?.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.woRepository.createQueryBuilder('wo')
      .leftJoinAndSelect('wo.item', 'item');

    if (filter?.status) {
      queryBuilder.andWhere('wo.status = :status', { status: filter.status });
    }

    if (filter?.itemId) {
      queryBuilder.andWhere('wo.itemId = :itemId', { itemId: filter.itemId });
    }

    // PR-127: 작업지시 검색 선택(BOM 소요명세서 등)용 — 완제품 Item의 이름/코드/스타일번호 부분일치.
    const keyword = filter?.keyword?.trim();
    if (keyword) {
      queryBuilder.andWhere(
        '(LOWER(item.name) LIKE LOWER(:kw) OR LOWER(item.code) LIKE LOWER(:kw) OR LOWER(item.styleNo) LIKE LOWER(:kw))',
        { kw: `%${keyword}%` },
      );
    }

    if (filter?.startDate) {
      queryBuilder.andWhere('wo.createdAt >= :startDate', { startDate: filter.startDate });
    }

    if (filter?.endDate) {
      queryBuilder.andWhere('wo.createdAt <= :endDate', { endDate: filter.endDate });
    }

    queryBuilder
      .orderBy('wo.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: number): Promise<WorkOrder> {
    const wo = await this.woRepository.findOne({
      where: { id },
      relations: ['item'],
    });
    if (!wo) {
      throw new NotFoundException(`ID가 ${id}인 작업 지시를 찾을 수 없습니다.`);
    }
    return wo;
  }

  // PR-120: BOM 소요명세서 — 작업지시 물량(targetQuantity)으로 자재별 필요 총수량을 전개하고, 이미 발주한
  // 수량(취소 제외, PENDING+RECEIVED)과 대조해 부족분을 계산한다. 조회 전용이라 아무것도 바꾸지 않는다.
  // BOM이 없는 경우는 에러가 아니라 정상적인 보고서 상태(reason)로 돌려준다 — 화면이 안내 문구를 띄운다.
  async getMaterialRequirements(id: number) {
    const wo = await this.findOne(id);
    const styleNo = wo.item?.styleNo ?? null;
    const base = {
      workOrder: {
        id: wo.id,
        itemId: wo.itemId,
        itemName: wo.item?.name ?? null,
        targetQuantity: Number(wo.targetQuantity),
        status: wo.status,
      },
      styleNo,
    };
    if (!styleNo) {
      return { ...base, reason: 'NO_STYLE_NO' as const, ...EMPTY_REQUIREMENTS };
    }
    return { ...base, ...(await this.expandStyleRequirements(styleNo, Number(wo.targetQuantity))) };
  }

  // PR-126: 작업지시 없이 "스타일 + 수량"만으로 같은 계산을 한다(발주 화면의 "스타일번호로 필요 자재 찾기"). 계산은
  // getMaterialRequirements와 완전히 같은 경로(expandStyleRequirements → calculateMaterialRequirements)를 쓴다.
  // 수량을 안 주면 스타일 오더개요의 총 수량(StyleOverview.totalQty)을 쓰고, 그것도 없으면 0(화면에서 수량을 입력받는다).
  async getStyleRequirements(styleNo: string, quantity?: number) {
    const style = await this.dataSource.manager.findOne(MasterStyle, { where: { styleNo }, relations: ['overview'] });
    const styleTotalQty = Number(style?.overview?.totalQty) || 0;
    const requested = Number(quantity);
    const useRequested = Number.isFinite(requested) && requested > 0;
    const target = useRequested ? requested : styleTotalQty;
    const expanded = await this.expandStyleRequirements(styleNo, target);
    return {
      styleNo,
      styleExists: !!style,
      quantity: target,
      quantitySource: useRequested ? ('REQUESTED' as const) : styleTotalQty > 0 ? ('STYLE_TOTAL_QTY' as const) : ('NONE' as const),
      styleTotalQty,
      ...expanded,
    };
  }

  // BOM 전개 공용 로직: 스타일의 활성 BOM(pickActiveBom) → 자재별 필요 총수량(consumption × targetQuantity) →
  // 이미 발주한 수량(취소 제외 PENDING+RECEIVED)과 대조한 부족분.
  private async expandStyleRequirements(styleNo: string, targetQuantity: number) {
    const manager = this.dataSource.manager;
    const boms = await manager.find(Bom, { where: { style: { styleNo } }, order: { id: 'DESC' } });
    // PR-121: 최신 id가 아니라 활성(isActive) BOM 중 최신을 쓴다("BOM 중복 검토" 화면에서 선택한 것).
    const latest = pickActiveBom(boms);
    if (!latest) return { reason: 'NO_BOM' as const, ...EMPTY_REQUIREMENTS };

    const bom = await manager.findOne(Bom, { where: { id: latest.id }, relations: ['items', 'items.material'] });
    const items = bom?.items ?? [];

    const itemIds = [...new Set(items.map((i) => i.material?.id).filter((v): v is number => typeof v === 'number'))];
    const ordered = new Map<number, number>();
    if (itemIds.length > 0) {
      const raw = await manager
        .createQueryBuilder(PurchaseOrder, 'po')
        .select('po.itemId', 'itemId')
        .addSelect('SUM(po.quantity)', 'qty')
        .where('po.itemId IN (:...itemIds)', { itemIds })
        .andWhere('po.status != :cancelled', { cancelled: PurchaseOrderStatus.CANCELLED })
        .groupBy('po.itemId')
        .getRawMany();
      for (const r of raw) ordered.set(Number(r.itemId), Number(r.qty) || 0);
    }

    const rows = calculateMaterialRequirements(targetQuantity, items, ordered);
    return {
      reason: null,
      bom: { id: latest.id, bomNo: latest.bomNo, version: latest.version, isActive: latest.isActive !== false },
      bomCount: boms.length,
      rows,
      totals: { materialCount: rows.length, shortageMaterialCount: rows.filter((r) => r.shortageQty > 0).length },
    };
  }

  async updateStatus(id: number, statusOrDto: any): Promise<WorkOrder> {
    const wo = await this.findOne(id);
    const statusValue = typeof statusOrDto === 'object' && statusOrDto.status ? statusOrDto.status : statusOrDto;

    if (statusValue !== WorkOrderStatus.COMPLETED) {
      wo.status = statusValue;
      return await this.woRepository.save(wo);
    }

    return await this.completeWithInventoryDeduction(wo);
  }

  private async completeWithInventoryDeduction(wo: WorkOrder): Promise<WorkOrder> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const styleNo = wo.item?.styleNo;
      const style = styleNo
        ? await queryRunner.manager.findOne(MasterStyle, { where: { styleNo } })
        : null;

      if (!style) {
        this.logger.warn(
          `WorkOrder #${wo.id}: item.styleNo(${styleNo ?? 'N/A'})에 해당하는 MasterStyle을 찾을 수 없어 재고 차감 없이 상태만 COMPLETED로 변경합니다.`,
        );
        return await this.finalizeWithoutInventory(queryRunner, wo);
      }

      // 같은 style에 Bom이 중복될 수 있어(운영 데이터) 사용할 BOM은 pickActiveBom 규칙(활성 BOM 중 최신)으로 고른다
      // — "BOM 중복 검토" 화면에서 선택한 BOM과 재고 차감이 항상 같은 BOM을 쓰도록 PR-123에서 통일했다.
      const styleBoms = await queryRunner.manager.find(Bom, {
        where: { style: { styleNo: style.styleNo } },
        relations: ['items', 'items.material'],
        order: { items: { id: 'ASC' } } as any, // 항목 순서 고정(부족 자재 메시지 순서가 물리적 행 순서에 따라 바뀌지 않게)
      });
      const bom = pickActiveBom(styleBoms);

      if (!bom) {
        this.logger.warn(
          `WorkOrder #${wo.id}: style(${style.styleNo})에 등록된 Bom이 없어 재고 차감 없이 상태만 COMPLETED로 변경합니다.`,
        );
        return await this.finalizeWithoutInventory(queryRunner, wo);
      }

      const shortages: string[] = [];
      const deductions: { inventory: Inventory; requiredQty: number }[] = [];

      for (const bomItem of bom.items) {
        const requiredQty = Number(bomItem.consumption) * wo.targetQuantity;
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { itemId: bomItem.material.id },
        });
        const available = inventory?.quantity ?? 0;

        if (available < requiredQty) {
          shortages.push(
            `${bomItem.material.name}(itemId=${bomItem.material.id}): 필요 ${requiredQty}, 보유 ${available}`,
          );
        } else {
          deductions.push({ inventory: inventory as Inventory, requiredQty });
        }
      }

      if (shortages.length > 0) {
        throw new BadRequestException(`원자재 재고가 부족하여 작업 지시를 완료할 수 없습니다: ${shortages.join(', ')}`);
      }

      for (const { inventory, requiredQty } of deductions) {
        inventory.quantity -= requiredQty;
        await queryRunner.manager.save(Inventory, inventory);
      }

      let finishedInventory = await queryRunner.manager.findOne(Inventory, {
        where: { itemId: wo.item.id },
      });
      if (!finishedInventory) {
        finishedInventory = queryRunner.manager.create(Inventory, {
          itemId: wo.item.id,
          quantity: 0,
        });
      }
      finishedInventory.quantity += wo.targetQuantity;
      await queryRunner.manager.save(Inventory, finishedInventory);

      wo.status = WorkOrderStatus.COMPLETED;
      const saved = await queryRunner.manager.save(WorkOrder, wo);

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async finalizeWithoutInventory(queryRunner: QueryRunner, wo: WorkOrder): Promise<WorkOrder> {
    wo.status = WorkOrderStatus.COMPLETED;
    const saved = await queryRunner.manager.save(WorkOrder, wo);
    await queryRunner.commitTransaction();
    return saved;
  }

  async remove(id: number): Promise<void> {
    const wo = await this.findOne(id);
    await this.woRepository.remove(wo);
  }
}
