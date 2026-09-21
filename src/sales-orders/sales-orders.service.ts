import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VisionService } from './vision.service';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { Contract, ContractStatus } from '../styles/entities/contract.entity';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { AiSalesOrderResultDto } from './dto/ai-analysis.dto';
import { SalesOrderSpecsService } from './sales-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';

// PR-133: 수주(고객사로부터 받은 주문) 등록 흐름. 업로드하는 문서의 실물 이름은 "작업지시서"지만, 이 흐름이 만드는 것은
// 내부 생산 실행 지시(WorkOrder)가 아니라 오더개요(StyleOverview)+자재명세(BOM)+작업명세(SalesOrderSpec)+계약(Contract, 승인 대기)이다.
// WorkOrdersService에 섞여 있던 것을 그대로(로직 변경 없이) 옮겼다.
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly visionService: VisionService,
    private readonly mappingCommitService: MappingCommitService,
    private readonly salesOrderSpecsService: SalesOrderSpecsService,
    private readonly aiUsageLogService: AiUsageLogService,
  ) {}

  async analyzeImage(file: Express.Multer.File, userId: number) {
    const { results, usage, isMock } = await this.visionService.analyzeSalesOrder(file);
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
  async commitAnalysis(result: AiSalesOrderResultDto) {
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

    // 수주(작업지시서) 등록(엑셀 매핑 경로는 해당 없음)은 계약을 자동으로 승인 대기 상태로
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

    const spec = await this.salesOrderSpecsService.save(styleNo, result.workNotes, result.sizeSpecs);

    contract.triggeredBySalesOrderSpecId = spec.id;
    await contractRepository.save(contract);

    // PR-098: 병합 중 자동 반영을 보류한 항목(기존 factory 충돌, 기존 BomItem과 수량/
    // 요척 차이 등)을 업로드 화면이 사용자에게 보여줄 수 있게 그대로 얹어서 돌려준다.
    return Object.assign(spec, { warnings: commitResult.warnings });
  }

  async findSpecByStyleNo(styleNo: string) {
    return this.salesOrderSpecsService.findByStyleNo(styleNo);
  }
}
