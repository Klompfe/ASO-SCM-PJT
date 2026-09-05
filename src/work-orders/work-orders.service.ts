import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { Item } from '../items/entities/item.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { VisionService } from './vision.service';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { AiWorkOrderResultDto } from './dto/ai-analysis.dto';
import { WorkOrderSpecsService } from './work-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';

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
    const { results, usage } = await this.visionService.analyzeWorkOrder(file);
    // 목업 응답(usage.pageCount === 0)은 실제 API 비용이 없으므로 과금 로그를 남기지 않는다.
    let chargedAmountKrw = 0;
    if (usage.pageCount > 0) {
      const log = await this.aiUsageLogService.log(userId, usage.pageCount, usage.promptTokens, usage.outputTokens);
      chargedAmountKrw = log.chargedAmountKrw;
    }
    return { results, chargedAmountKrw };
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

    await this.mappingCommitService.commit({
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

    return this.workOrderSpecsService.save(styleNo, result.workNotes, result.sizeSpecs);
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
