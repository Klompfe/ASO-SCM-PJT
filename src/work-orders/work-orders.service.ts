import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { Item } from '../items/entities/item.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { VisionService } from './vision.service';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { Contract, ContractStatus } from '../styles/entities/contract.entity';
import { Bom } from '../boms/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { AiWorkOrderResultDto } from './dto/ai-analysis.dto';
import { WorkOrderSpecsService } from './work-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { calculateMaterialRequirements } from './utils/material-requirements.util';
import { pickActiveBom } from '../boms/utils/active-bom.util';

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly woRepository: Repository<WorkOrder>,
    private readonly dataSource: DataSource,
    private readonly visionService: VisionService,
    private readonly mappingCommitService: MappingCommitService,
    private readonly workOrderSpecsService: WorkOrderSpecsService,
    private readonly aiUsageLogService: AiUsageLogService,
  ) {}

  async analyzeWorkOrderImage(file: Express.Multer.File, userId: number) {
    const { results, usage, isMock } = await this.visionService.analyzeWorkOrder(file);
    // 목업 응답(usage.pageCount === 0)은 실제 API 비용이 없으므로 과금 로그를 남기지 않는다.
    let chargedAmountKrw = 0;
    if (usage.pageCount > 0) {
      const log = await this.aiUsageLogService.log(userId, usage.pageCount, usage.promptTokens, usage.outputTokens);
      chargedAmountKrw = log.chargedAmountKrw;
    }
    return { results, chargedAmountKrw, isMock };
  }

  async getAiUsageForUser(userId: number) {
    return this.aiUsageLogService.findByUser(userId);
  }

  async getAiUsageSummaryForUser(userId: number) {
    return this.aiUsageLogService.getSummaryByUser(userId);
  }

  // AI 분석 결과(오더개요+자재명세+작업명세) 하나를 실제로 저장한다.
  // 오더개요+자재명세는 mapping-commit.service.ts의 기존 커밋 로직을 그대로 재사용해
  // Excel 매핑 커밋과 동일한 MasterStyle/StyleOverview/Bom/BomItem 생성 경로를 탄다.
  async commitAnalysis(result: AiWorkOrderResultDto) {
    const styleNo = result.overview.styleNo;
    if (!styleNo) {
      throw new BadRequestException('Style No.를 읽지 못했습니다 — 저장 전에 직접 입력해 주세요.');
    }

    const commitResult = await this.mappingCommitService.commit({
      styleNo,
      overviewData: {
        styleNo,
        factory: result.overview.factory || '',
        totalQty: result.overview.totalQty ?? 0,
        buyer: result.overview.buyer || '',
        styleName: result.overview.styleName ?? undefined,
        brand: result.overview.brand ?? undefined,
        itemType: result.overview.itemType ?? undefined,
        productionType: result.overview.productionType ?? undefined,
        targetRdd: result.overview.targetRdd ?? undefined,
      },
      bomItems: result.bomItems.map((b) => ({
        category: b.category ?? undefined,
        itemName: b.itemName,
        spec: b.spec ?? undefined,
        colorCode: b.colorCode ?? undefined,
        consumption: b.consumption ?? undefined,
        requiredQty: b.requiredQty ?? undefined,
        supplier: b.supplier ?? undefined,
        remarks: b.remarks ?? undefined,
      })),
    });

    // 작업지시서 등록(엑셀 매핑 경로는 해당 없음)은 계약을 자동으로 승인 대기 상태로
    // 만든다(PR-066). 방금 커밋된 StyleOverview를 다시 읽어 그 시점 값을 스냅샷으로
    // 고정한다 — result.overview를 그대로 쓰지 않는 이유는 cmtPrice/fobPrice처럼
    // AI 분석 DTO에 없는 필드도 있고, 실제로 DB에 저장된 값(기본값 처리 등 포함)과
    // 어긋나지 않게 하기 위해서다.
    const style = await this.dataSource
      .getRepository(MasterStyle)
      .findOne({ where: { styleNo }, relations: ['overview'] });
    const overview = style?.overview;

    const contractRepository = this.dataSource.getRepository(Contract);
    const contract = contractRepository.create({
      styleNo,
      status: ContractStatus.PENDING_APPROVAL,
      totalQty: overview?.totalQty ?? null,
      targetRdd: overview?.targetRdd ?? null,
      factory: overview?.factory ?? null,
      buyer: overview?.buyer ?? null,
      productionType: overview?.productionType ?? null,
      cmtPrice: overview?.cmtPrice ?? null,
      fobPrice: overview?.fobPrice ?? null,
    });
    await contractRepository.save(contract);

    const spec = await this.workOrderSpecsService.save(styleNo, result.workNotes, result.sizeSpecs);

    contract.triggeredByWorkOrderSpecId = spec.id;
    await contractRepository.save(contract);

    // PR-098: 병합 중 자동 반영을 보류한 항목(기존 factory 충돌, 기존 BomItem과 수량/
    // 요척 차이 등)을 업로드 화면이 사용자에게 보여줄 수 있게 그대로 얹어서 돌려준다.
    return Object.assign(spec, { warnings: commitResult.warnings });
  }

  async findSpecByStyleNo(styleNo: string) {
    return this.workOrderSpecsService.findByStyleNo(styleNo);
  }

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
    const empty = { rows: [], totals: { materialCount: 0, shortageMaterialCount: 0 }, bom: null, bomCount: 0 };
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

    if (!styleNo) return { ...base, reason: 'NO_STYLE_NO' as const, ...empty };

    const manager = this.dataSource.manager;
    const boms = await manager.find(Bom, { where: { style: { styleNo } }, order: { id: 'DESC' } });
    // PR-121: 최신 id가 아니라 활성(isActive) BOM 중 최신을 쓴다("BOM 중복 검토" 화면에서 선택한 것).
    const latest = pickActiveBom(boms);
    if (!latest) return { ...base, reason: 'NO_BOM' as const, ...empty };

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

    const rows = calculateMaterialRequirements(Number(wo.targetQuantity), items, ordered);
    return {
      ...base,
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

      // 알려진 이슈: 같은 style에 Bom이 중복 생성될 수 있음. 지금은 가장 최근(id DESC) 것만 사용한다.
      const bom = await queryRunner.manager.findOne(Bom, {
        where: { style: { styleNo: style.styleNo } },
        order: { id: 'DESC' },
        relations: ['items', 'items.material'],
      });

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
