import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract, ContractStatus } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';
import { ProductionType, SalesMarket } from './entities/style-overview.entity';
import { IssueContractDto } from './dto/issue-contract.dto';
import { ApproveContractDto } from './dto/approve-contract.dto';
import { SalesContractPricesService } from '../sales-contract-prices/sales-contract-prices.service';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { classifyBrand } from '../common/utils/brand-classifier.util';
import { Buyer } from '../buyers/entities/buyer.entity';

// PR-167: 판매시장(국내/중국)에 따라 계약방식이 갈리는 브랜드 — 그 외는
// Buyer.defaultProductionType 제안값을 쓴다. 하드코딩이지만 "어떤 브랜드가
// 판매시장 분기 대상인지" 자체는 사용자가 확정한 업무 규칙이라 설정 테이블이
// 아니라 코드 상수로 둔다(브랜드 접두사 규칙처럼 자주 안 바뀜).
const SALES_MARKET_DEPENDENT_BRANDS = ['빈폴', '에잇세컨즈'];

export interface ContractApprovalContext {
  contractId: number;
  styleNo: string;
  brand: string | null;
  requiresSalesMarket: boolean;
  currentSalesMarket: SalesMarket | null;
  suggestedProductionType: ProductionType | null;
  buyerDefaultProductionType: ProductionType | null;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    @InjectRepository(Buyer)
    private readonly buyerRepository: Repository<Buyer>,
    private readonly salesContractPricesService: SalesContractPricesService,
    private readonly brandPrefixRulesService: BrandPrefixRulesService,
    private readonly dataSource: DataSource,
  ) {}

  // PR-166 이전에는 수동 발행(여기)이 StyleOverview 값을 전혀 복사하지 않아,
  // 같은 스타일이라도 수주 등록(AI 분석, sales-orders.service.ts commitAnalysis)
  // 경로로 만들어진 계약과 달리 공장/바이어/단가 등이 전부 null이었다 — 두 경로의
  // 결과물이 일관되도록 수동 발행도 그 시점 StyleOverview 스냅샷을 그대로 복사한다.
  // CMT 계약이고 cmtPrice가 아직 없으면 CMT매입단가 표준가격을 추가로 조회해 채운다
  // (정확매칭/브랜드품종평균이면 자동 입력, 그래도 못 찾으면 null로 두고 근거만 남겨
  // 승인자가 수동으로 입력하게 한다 — 승인 자체를 막지는 않는다).
  async issue(dto: IssueContractDto): Promise<Contract> {
    const style = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo }, relations: ['overview'] });
    if (!style) {
      throw new NotFoundException(`존재하지 않는 스타일입니다: ${dto.styleNo}`);
    }
    const overview = style.overview;

    let cmtPrice = overview?.cmtPrice ?? null;
    let cmtPriceConfidence: Contract['cmtPriceConfidence'] = null;
    let cmtPriceNote: string | null = null;

    if (overview?.productionType === ProductionType.CMT && cmtPrice == null) {
      const resolved = await this.salesContractPricesService.resolve(dto.styleNo, overview.itemType ?? undefined);
      cmtPriceConfidence = resolved.confidence;
      cmtPriceNote = resolved.note;
      if (resolved.price != null) {
        cmtPrice = resolved.price;
      }
    }

    const contract = this.contractRepository.create({
      styleNo: dto.styleNo,
      notes: dto.notes ?? null,
      totalQty: overview?.totalQty ?? null,
      targetRdd: overview?.targetRdd ?? null,
      factory: overview?.factory ?? null,
      buyer: overview?.buyer ?? null,
      productionType: overview?.productionType ?? null,
      cmtPrice,
      fobPrice: overview?.fobPrice ?? null,
      cmtPriceConfidence,
      cmtPriceNote,
    });
    return this.contractRepository.save(contract);
  }

  async findByStyleNo(styleNo: string): Promise<Contract[]> {
    return this.contractRepository.find({
      where: { styleNo },
      order: { issuedAt: 'DESC' },
    });
  }

  private async resolveBrand(styleNo: string): Promise<string | null> {
    const rules = await this.brandPrefixRulesService.findAll();
    return classifyBrand(styleNo, rules);
  }

  // 승인 화면이 "이 계약은 판매시장 선택이 필요한지, 다른 브랜드면 제안값이
  // 뭔지"를 미리 보여줄 수 있도록 — 승인을 시도하지 않고 조회만 한다.
  async getApprovalContext(id: number): Promise<ContractApprovalContext> {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
    }
    const brand = await this.resolveBrand(contract.styleNo);
    const requiresSalesMarket = brand != null && SALES_MARKET_DEPENDENT_BRANDS.includes(brand);

    let suggestedProductionType: ProductionType | null = null;
    let buyerDefaultProductionType: ProductionType | null = null;

    if (requiresSalesMarket) {
      const market = contract.salesMarket;
      if (market === SalesMarket.DOMESTIC) suggestedProductionType = ProductionType.CMT;
      else if (market === SalesMarket.CHINA) suggestedProductionType = ProductionType.FOB;
    } else if (contract.buyer) {
      const buyer = await this.buyerRepository.findOne({ where: { name: contract.buyer } });
      buyerDefaultProductionType = buyer?.defaultProductionType ?? null;
      suggestedProductionType = buyerDefaultProductionType;
    }

    return {
      contractId: contract.id,
      styleNo: contract.styleNo,
      brand,
      requiresSalesMarket,
      currentSalesMarket: contract.salesMarket,
      suggestedProductionType,
      buyerDefaultProductionType,
    };
  }

  // 승인은 "이 스타일의 활성 계약은 항상 하나"를 보장해야 하므로, 기존 APPROVED 건을
  // SUPERSEDED로 내리는 것과 이 건을 APPROVED로 올리는 것을 한 트랜잭션으로 묶는다.
  // PR-167: 빈폴/에잇세컨즈는 판매시장을 모르면 계약방식(CMT/FOB)을 확정할 수
  // 없으므로, 승인 시점에 overrides.salesMarket(또는 이미 Contract에 저장된 값)이
  // 없으면 승인 자체를 막는다 — 자동 추론 금지(사용자 확인 사항)에 따른 안전장치.
  async approve(id: number, approvedByUserId: number, overrides?: ApproveContractDto): Promise<Contract> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const contract = await queryRunner.manager.findOne(Contract, { where: { id } });
      if (!contract) {
        throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
      }
      if (contract.status !== ContractStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `이미 처리된 계약입니다(현재 상태: ${contract.status}). 승인 대기 상태만 승인할 수 있습니다.`,
        );
      }

      const brand = await this.resolveBrand(contract.styleNo);
      const requiresSalesMarket = brand != null && SALES_MARKET_DEPENDENT_BRANDS.includes(brand);
      const effectiveSalesMarket = overrides?.salesMarket ?? contract.salesMarket;

      if (requiresSalesMarket && !effectiveSalesMarket) {
        throw new BadRequestException(
          `${brand}은(는) 판매시장(국내/중국)을 지정해야 승인할 수 있습니다 — 국내 판매는 CMT, 중국 판매는 FOB로 계약방식이 갈립니다.`,
        );
      }
      if (effectiveSalesMarket) {
        contract.salesMarket = effectiveSalesMarket;
      }
      if (overrides?.productionType) {
        contract.productionType = overrides.productionType;
      }

      const existingApproved = await queryRunner.manager.findOne(Contract, {
        where: { styleNo: contract.styleNo, status: ContractStatus.APPROVED },
      });
      if (existingApproved) {
        existingApproved.status = ContractStatus.SUPERSEDED;
        await queryRunner.manager.save(existingApproved);
      }

      contract.status = ContractStatus.APPROVED;
      contract.approvedByUserId = approvedByUserId;
      contract.approvedAt = new Date();
      const saved = await queryRunner.manager.save(contract);

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // PR-090: 일괄승인. ids가 있으면 그 목록만, 없으면 현재 PENDING_APPROVAL 전체를
  // 대상으로 한다. 새 로직을 따로 만들지 않고 기존 approve()를 건별로 그대로 재사용해
  // "같은 styleNo의 기존 APPROVED를 SUPERSEDED로 내린다"는 불변식이 깨지지 않게 한다.
  // 동시성을 위해 병렬(Promise.all)로 돌리면 같은 styleNo의 계약 두 건이 배치에 함께
  // 들어있을 때 경쟁이 생길 수 있어 순차 처리한다.
  // PR-167: ids가 없을 때 factory를 주면(기본값 "태일") 그 생산처 스타일의 건만
  // 대상으로 좁힌다 — 다른 생산처(재원/삼정 등) 건은 숨기는 게 아니라 그냥 이번
  // 일괄승인 대상에서 빠질 뿐, 개별 승인이나 다른 필터로는 그대로 조회/승인 가능하다.
  // 판매시장 미지정(빈폴/에잇세컨즈)으로 approve()가 막는 건은 failed[]에 사유와
  // 함께 담겨 넘어간다(안전모드 — 일괄승인이 조용히 건너뛰지 않는다).
  async bulkApprove(
    ids: number[] | undefined,
    approvedByUserId: number,
    factory?: string,
  ): Promise<{ approvedCount: number; failed: { id: number; reason: string }[] }> {
    let targetIds: number[];
    if (ids && ids.length > 0) {
      targetIds = ids;
    } else {
      const pending = await this.contractRepository.find({ where: { status: ContractStatus.PENDING_APPROVAL } });
      if (factory) {
        const styles = await this.masterStyleRepository.find({ relations: ['overview'] });
        const factoryByStyleNo = new Map(styles.map((s) => [s.styleNo, s.overview?.factory ?? null]));
        targetIds = pending.filter((c) => factoryByStyleNo.get(c.styleNo) === factory).map((c) => c.id);
      } else {
        targetIds = pending.map((c) => c.id);
      }
    }

    let approvedCount = 0;
    const failed: { id: number; reason: string }[] = [];

    for (const id of targetIds) {
      try {
        await this.approve(id, approvedByUserId);
        approvedCount++;
      } catch (err) {
        failed.push({ id, reason: err instanceof Error ? err.message : '알 수 없는 오류' });
      }
    }

    return { approvedCount, failed };
  }

  async reject(id: number): Promise<Contract> {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
    }
    if (contract.status !== ContractStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `이미 처리된 계약입니다(현재 상태: ${contract.status}). 승인 대기 상태만 거절할 수 있습니다.`,
      );
    }
    contract.status = ContractStatus.REJECTED;
    return this.contractRepository.save(contract);
  }

  async remove(id: number): Promise<void> {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
    }
    await this.contractRepository.remove(contract);
  }
}
