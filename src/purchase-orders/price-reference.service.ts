import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { Bom } from '../boms/entities/bom.entity';
import { pickActiveBom } from '../boms/utils/active-bom.util';
import { BrandPriceRulesService } from '../brand-price-rules/brand-price-rules.service';
import { MidoPriceTableService, type MeterPriceConversionInfo } from '../mido-price-table/mido-price-table.service';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { classifyBrand } from '../common/utils/brand-classifier.util';
import { CustomsExchangeRatesService } from '../customs-exchange-rates/customs-exchange-rates.service';
import { ExchangeRateType } from '../customs-exchange-rates/entities/customs-exchange-rate.entity';
import { GetPriceReferenceDto } from './dto/get-price-reference.dto';

export interface PriceReferenceCandidate {
  source: 'BRAND_RULE' | 'MIDO_TABLE';
  label: string;
  priceUsd: number;
  priceUsdMax?: number;
  unit: string;
  note?: string | null;
  conversion?: MeterPriceConversionInfo;
  brandRuleId?: number;
  midoPriceItemId?: number;
}

export interface PriceReferenceResult {
  candidates: PriceReferenceCandidate[];
  suggested: PriceReferenceCandidate | null;
  unitMismatchWarning?: string;
  brand: string | null;
  krw?: { rate: number; validFrom: string; validTo: string; rateType: 'EXPORT'; approxUnitPriceKrw: number };
}

const normUnit = (u: string | null | undefined): string => (u ?? '').trim().toUpperCase();

// PR-185 C: 단가표(미도 단가표 USD) 참고단가 — 브랜드 전용가(BRAND_RULE) → 미도 단가표(MIDO_TABLE)
// 순서로 후보를 모아 보여준다. 자동으로 하나를 저장하지 않는다(안전모드) — 화면에서 사람이
// 고르거나 직접 입력(MANUAL)한다. krw는 참고 환산일 뿐 저장하지 않는다.
@Injectable()
export class PriceReferenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly brandPriceRulesService: BrandPriceRulesService,
    private readonly midoPriceTableService: MidoPriceTableService,
    private readonly brandPrefixRulesService: BrandPrefixRulesService,
    private readonly customsExchangeRatesService: CustomsExchangeRatesService,
  ) {}

  // 스타일이 있으면 그 스타일의 최신(활성) BOM에서 이 자재(itemId)가 쓰인 행의 category를
  // 돌려준다(BomItem.category 매칭용). BOM/행이 없으면 빈 문자열(자재명 매칭만 쓰게 됨).
  private async resolveCategoryText(styleNo: string | undefined, itemId: number): Promise<string> {
    if (!styleNo) return '';
    const boms = await this.dataSource.getRepository(Bom).find({ where: { style: { styleNo } }, relations: ['items', 'items.material'] });
    const latest = pickActiveBom(boms);
    const rows = (latest?.items ?? []).filter((i) => i.material?.id === itemId);
    return rows.map((r) => r.category ?? '').join(' ');
  }

  private async resolveBrand(styleNo: string | undefined, brandName: string | undefined): Promise<string | null> {
    if (styleNo) {
      const rules = await this.brandPrefixRulesService.findAll();
      return classifyBrand(styleNo, rules);
    }
    return brandName?.trim() || null;
  }

  async getPriceReference(dto: GetPriceReferenceDto): Promise<PriceReferenceResult> {
    const item = await this.dataSource.getRepository(Item).findOne({ where: { id: dto.itemId } });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const brand = await this.resolveBrand(dto.styleNo, dto.brandName);
    const categoryText = await this.resolveCategoryText(dto.styleNo, dto.itemId);
    const matchText = `${categoryText} ${item.name}`;

    const brandCandidates: PriceReferenceCandidate[] = [];
    if (brand) {
      const rules = await this.brandPriceRulesService.findActive();
      const matched = rules.filter((r) => r.brandName === brand && matchText.includes(r.categoryKeyword));
      for (const rule of matched) {
        brandCandidates.push({
          source: 'BRAND_RULE',
          label: `${rule.brandName} 전용가(${rule.categoryKeyword})`,
          priceUsd: Number(rule.priceUsd),
          unit: rule.unit,
          note: rule.note,
          brandRuleId: rule.id,
        });
      }
    }

    const lineUnit = dto.lineUnit ?? item.unit ?? undefined;
    const midoMatches = await this.midoPriceTableService.findCandidates(item.name, { lineUnit, materialSubType: dto.materialSubType });
    const midoCandidates: PriceReferenceCandidate[] = midoMatches.map((m) => ({
      source: 'MIDO_TABLE',
      label: m.itemName,
      priceUsd: Number(m.priceUsdMin),
      ...(Number(m.priceUsdMax) !== Number(m.priceUsdMin) ? { priceUsdMax: Number(m.priceUsdMax) } : {}),
      unit: m.unit,
      note: m.note,
      ...(m.conversion ? { conversion: m.conversion } : {}),
      midoPriceItemId: m.id,
    }));

    // 후보 순서: 브랜드 전용가 → 미도 단가표.
    const candidates = [...brandCandidates, ...midoCandidates];

    // suggested: 후보가 정확히 1개이고, 범위값(Min≠Max)이 아니며, 환산 선택이 필요 없을 때만.
    let suggested: PriceReferenceCandidate | null = null;
    if (candidates.length === 1) {
      const c = candidates[0];
      const isRange = c.priceUsdMax !== undefined;
      const conversionUndetermined = c.conversion?.determined === false;
      if (!isRange && !conversionUndetermined) suggested = c;
    }

    // 자재 단위와 (제안 또는 첫) 후보 단위가 다르면 경고 — 미터→콘/롤 환산 대상(conversion 있음)은 정상 동작이라 제외.
    let unitMismatchWarning: string | undefined;
    const reference = suggested ?? candidates[0];
    if (reference && lineUnit && !reference.conversion) {
      const a = normUnit(lineUnit);
      const b = normUnit(reference.unit);
      if (a && b && a !== b && !a.includes(b) && !b.includes(a)) {
        unitMismatchWarning = `자재 단위(${lineUnit})와 단가 단위(${reference.unit})가 다릅니다 — 환산해서 입력하세요.`;
      }
    }

    const result: PriceReferenceResult = { candidates, suggested, brand, ...(unitMismatchWarning ? { unitMismatchWarning } : {}) };

    if (suggested) {
      const lookup = await this.customsExchangeRatesService.lookup(ExchangeRateType.EXPORT, 'USD', this.todayKst());
      if (lookup.found && lookup.rate != null) {
        result.krw = {
          rate: lookup.rate,
          validFrom: lookup.validFrom!,
          validTo: lookup.validTo!,
          rateType: 'EXPORT',
          approxUnitPriceKrw: Math.round(suggested.priceUsd * lookup.rate),
        };
      }
    }

    return result;
  }

  private todayKst(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
