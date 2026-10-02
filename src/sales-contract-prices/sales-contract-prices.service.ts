import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SalesContractPriceRow } from './entities/sales-contract-price-row.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { classifyBrand } from '../common/utils/brand-classifier.util';
import { SalesContractPriceImportParser } from './utils/sales-contract-price-import-parser.util';
import { resolveCmtPrice, type ResolvedCmtPrice } from './utils/sales-contract-price-resolver.util';

export interface ImportResult {
  importBatch: string;
  importedCount: number;
  skippedCount: number;
  unclassifiedBrandCount: number;
}

@Injectable()
export class SalesContractPricesService {
  constructor(
    @InjectRepository(SalesContractPriceRow)
    private readonly repository: Repository<SalesContractPriceRow>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    private readonly brandPrefixRulesService: BrandPrefixRulesService,
    private readonly dataSource: DataSource,
  ) {}

  // 통합본 파일은 항상 "그 시점의 전체 집합"이라, 재업로드 시 이전 배치를 전부
  // 지우고 새로 채운다(계속 쌓이면 지난 시즌 단가가 최신 평균 계산을 오염시킨다).
  // 한 트랜잭션으로 묶어 삭제 중간에 실패해도 기존 데이터가 반쪽만 사라지지 않게 한다.
  async importFromExcel(buffer: Buffer): Promise<ImportResult> {
    const { rows, skippedCount } = SalesContractPriceImportParser.parse(buffer);
    const rules = await this.brandPrefixRulesService.findAll();

    let unclassifiedBrandCount = 0;
    const importBatch = randomUUID();
    const entities = rows.map((row) => {
      const brand = classifyBrand(row.styleNo, rules);
      if (!brand) unclassifiedBrandCount++;
      return this.repository.create({
        styleNo: row.styleNo,
        brand,
        category: row.category,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        amount: row.amount,
        sourceFile: row.sourceFile,
        importBatch,
      });
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.clear(SalesContractPriceRow);
      if (entities.length) {
        await manager.save(entities);
      }
    });

    return { importBatch, importedCount: entities.length, skippedCount, unclassifiedBrandCount };
  }

  async resolve(styleNo: string, itemTypeOverride?: string): Promise<ResolvedCmtPrice & { brand: string | null; category: string | null }> {
    const rules = await this.brandPrefixRulesService.findAll();
    const brand = classifyBrand(styleNo, rules);

    let category = itemTypeOverride ?? null;
    if (!category) {
      const style = await this.masterStyleRepository.findOne({ where: { styleNo }, relations: ['overview'] });
      category = style?.overview?.itemType ?? null;
    }

    const rawRows = await this.repository.find();
    // 버그 수정: TypeORM은 decimal 컬럼을 문자열로 반환한다(정밀도 손실 방지를
    // 위한 의도된 동작) — 엔티티 타입은 number라고 선언돼 있지만 런타임엔 "10.0000"
    // 같은 문자열이라, 평균 계산에서 0+"10.0000"이 숫자 덧셈이 아니라 문자열 연결이
    // 되어(NaN까지 섞이며) 편차가 큰 그룹도 "평균 신뢰 가능"으로 잘못 분류됐었다.
    // 여기서 명시적으로 숫자로 변환해 순수 로직(resolveCmtPrice)의 number 계약을 지킨다.
    const rows = rawRows.map((r) => ({ ...r, unitPrice: Number(r.unitPrice) }));
    const result = resolveCmtPrice(styleNo, brand, category, rows);
    return { ...result, brand, category };
  }

  async count(): Promise<{ total: number; lastImportBatch: string | null; lastImportedAt: Date | null }> {
    const total = await this.repository.count();
    const latest = await this.repository.findOne({ where: {}, order: { createdAt: 'DESC' } });
    return { total, lastImportBatch: latest?.importBatch ?? null, lastImportedAt: latest?.createdAt ?? null };
  }
}
