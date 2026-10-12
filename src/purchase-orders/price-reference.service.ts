import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { Bom } from '../boms/entities/bom.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { pickActiveBom } from '../boms/utils/active-bom.util';
import { BrandPriceRulesService } from '../brand-price-rules/brand-price-rules.service';
import { MidoPriceTableService, type MeterPriceConversionInfo } from '../mido-price-table/mido-price-table.service';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { classifyBrand } from '../common/utils/brand-classifier.util';
import { CustomsExchangeRatesService } from '../customs-exchange-rates/customs-exchange-rates.service';
import { ExchangeRateType } from '../customs-exchange-rates/entities/customs-exchange-rate.entity';
import { GetPriceReferenceDto } from './dto/get-price-reference.dto';
import { MaterialPackagingUnitRule } from '../material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
import { effectiveSubType, looksLikeThreadOrTape } from '../common/utils/packaging-subtype.util';
import { classifyPackagingUnit } from '../export-shipments/utils/meter-price-conversion.util';

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
  // PR-187: 미터단가 후보가 콘/롤단가로 환산되면(종류가 확정되고 규칙이 1개로 정해질 때) 그
  // 근거 식을 남긴다 — 있으면 이 후보의 priceUsd/unit은 이미 콘/롤 기준으로 바뀐 값이다.
  conversionFormula?: string;
  convertedFrom?: { priceUsd: number; unit: string; unitLengthM: number };
}

export interface PriceReferenceResult {
  candidates: PriceReferenceCandidate[];
  suggested: PriceReferenceCandidate | null;
  unitMismatchWarning?: string;
  // PR-187: 종류 미지정인데 이름이 실/테이프로 보이는 자재 — 미터단가를 그대로 쓰도록
  // 유도하지 않기 위한 경고(이때는 unitMismatchWarning을 함께 내지 않는다).
  warning?: string;
  brand: string | null;
  krw?: { rate: number; validFrom: string; validTo: string; rateType: 'EXPORT'; approxUnitPriceKrw: number };
  // PR-187: 환산이 적용됐을 때 콘/롤 단위 라벨 — 화면이 "USD/콘" 같은 단위 표시에 쓴다.
  packagingUnitLabel?: string;
  // PR-188: 미도 단가표 후보를 왜 못 보여주는지(브랜드 미상/미도 브랜드 아님) 안내.
  // 미도 브랜드라 후보를 정상적으로 보여줄 때는 없다.
  note?: string;
}

const normUnit = (u: string | null | undefined): string => (u ?? '').trim().toUpperCase();
const MISSING_SUBTYPE_WARNING = '실/테이프 종류 미지정 — 선택해 주세요';
const NO_BRAND_NOTE = '브랜드를 선택하면 단가표 후보가 표시됩니다';
const NOT_MIDO_BRAND_NOTE = '이 브랜드는 미도 단가표 적용 대상이 아닙니다';
// PR-188: 미도컴퍼니 소유 브랜드만 미도 단가표를 참고단가로 쓴다(제시님 결정) —
// brand_prefix_rules.priceTableCode==='MIDO'인 브랜드만 해당.
const MIDO_PRICE_TABLE_CODE = 'MIDO';

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

  // 스타일이 있으면 그 스타일의 최신(활성) BOM에서 이 자재(itemId)가 쓰인 행을 돌려준다
  // (category 텍스트 매칭·PR-187의 종류(threadType/tapeType) 판정 공용). 스타일/행이
  // 없으면 빈 배열(자재명만으로 매칭하거나, 종류는 Item.materialSubType으로 폴백).
  private async resolveBomRows(styleNo: string | undefined, itemId: number): Promise<BomItem[]> {
    if (!styleNo) return [];
    const boms = await this.dataSource.getRepository(Bom).find({ where: { style: { styleNo } }, relations: ['items', 'items.material'] });
    const latest = pickActiveBom(boms);
    return (latest?.items ?? []).filter((i) => i.material?.id === itemId);
  }

  // PR-187: BOM 행에 종류(threadType/tapeType)가 정확히 1개 값으로 일치하면 그 값, 행이
  // 없거나(전부 null) 서로 다른 값이 섞여 모호하면 null(추측 안 함) —
  // calculateMaterialRequirements의 subtypeMixed와 같은 원칙(material-requirements.util.ts).
  private resolveBomSubtype(rows: BomItem[]): string | null {
    const values = new Set(
      rows.map((r): string | null => r.threadType ?? r.tapeType ?? null).filter((v): v is string => v != null),
    );
    return values.size === 1 ? [...values][0] : null;
  }

  async getPriceReference(dto: GetPriceReferenceDto): Promise<PriceReferenceResult> {
    const item = await this.dataSource.getRepository(Item).findOne({ where: { id: dto.itemId } });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    // PR-188: 브랜드 판정과 "이 브랜드가 미도 단가표를 쓰는지"를 같은 규칙 목록에서
    // 함께 구한다(브랜드별로 중복 조회하지 않음).
    const prefixRules = await this.brandPrefixRulesService.findAll();
    const brand = dto.styleNo ? classifyBrand(dto.styleNo, prefixRules) : (dto.brandName?.trim() || null);
    const brandRule = brand ? prefixRules.find((r) => r.brandName === brand) : undefined;
    const isMidoBrand = brandRule?.priceTableCode === MIDO_PRICE_TABLE_CODE;

    const bomRows = await this.resolveBomRows(dto.styleNo, dto.itemId);
    const categoryText = bomRows.map((r) => r.category ?? '').join(' ');
    const matchText = `${categoryText} ${item.name}`;

    // PR-185 C: 브랜드 전용가(뮤트 등)는 미도 적용 여부와 별개의 체계라 그대로 유지한다.
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

    // PR-188: 미도 브랜드(미센스/반에크/루미에반)가 아니면 미도 단가표 후보 자체를 만들지
    // 않는다(제시님 결정) — 종류 판정/환산/경고도 미도 브랜드일 때만 의미가 있다.
    let midoCandidates: PriceReferenceCandidate[] = [];
    let packagingUnitLabel: string | undefined;
    let unresolvedLooksLikeThreadOrTape = false;
    let lineUnit = dto.lineUnit ?? item.unit ?? undefined;

    if (isMidoBrand) {
      // PR-187 A-1: 유효 종류 — dto.materialSubType → (모호하지 않은) BOM 행 → Item.materialSubType.
      const bomSubtype = this.resolveBomSubtype(bomRows);
      const effectiveSubtype = dto.materialSubType ?? effectiveSubType({ threadType: bomSubtype }, item);

      const packagingRules = await this.dataSource.getRepository(MaterialPackagingUnitRule).find();

      // PR-187 A-2: 유효 포장단위 — 요청에 이미 콘/롤이 명시돼 있으면 그대로 쓰고(기존 동작
      // 유지), 아니면 유효 종류에 해당하는 규칙이 있을 때만 그 라벨(콘/롤)로 바꾼다. 규칙이
      // 없으면(데이터 누락) 추측하지 않고 기존처럼 Item.unit을 그대로 쓴다.
      const requestedLineUnit = lineUnit;
      const matchedRule = effectiveSubtype ? packagingRules.find((r) => r.materialSubType === effectiveSubtype) : undefined;
      if (!classifyPackagingUnit(requestedLineUnit) && matchedRule) {
        lineUnit = matchedRule.packagingUnitLabel;
        packagingUnitLabel = matchedRule.packagingUnitLabel;
      }

      const midoMatches = await this.midoPriceTableService.findCandidates(item.name, { lineUnit, materialSubType: effectiveSubtype ?? undefined });
      midoCandidates = midoMatches.map((m) => {
        const candidate: PriceReferenceCandidate = {
          source: 'MIDO_TABLE',
          label: m.itemName,
          priceUsd: Number(m.priceUsdMin),
          ...(Number(m.priceUsdMax) !== Number(m.priceUsdMin) ? { priceUsdMax: Number(m.priceUsdMax) } : {}),
          unit: m.unit,
          note: m.note,
          ...(m.conversion ? { conversion: m.conversion } : {}),
          midoPriceItemId: m.id,
        };
        // PR-187 A-3: 환산이 정확히 1개 종류로 확정되면 그 값으로 후보 자체를 바꾼다(미터단가
        // 중복 노출 안 함) — 근거는 convertedFrom/conversionFormula로 남긴다.
        if (m.conversion?.determined && m.conversion.options.length === 1) {
          const opt = m.conversion.options[0];
          candidate.convertedFrom = { priceUsd: Number(m.priceUsdMin), unit: 'M', unitLengthM: opt.unitLengthM };
          candidate.priceUsd = opt.unitPriceUsd;
          if (opt.unitPriceUsdMax !== undefined) candidate.priceUsdMax = opt.unitPriceUsdMax;
          else delete candidate.priceUsdMax;
          candidate.unit = opt.packagingUnitLabel;
          candidate.conversionFormula = opt.formula;
        }
        return candidate;
      });

      // PR-187 A-5: 종류 미지정 + 검토 안 됨 + 이름이 실/테이프로 보이는 자재는 미터단가를
      // 그대로 제안하지 않는다 — suggested를 강제로 비우고 전용 경고를 낸다(미도 브랜드에서만 의미 있음).
      unresolvedLooksLikeThreadOrTape = !effectiveSubtype && !item.packagingReviewedAt && looksLikeThreadOrTape(item.name, packagingRules);
    }

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

    if (unresolvedLooksLikeThreadOrTape) {
      suggested = null;
    }

    // 자재 단위와 (제안 또는 첫) 후보 단위가 다르면 경고 — 미터→콘/롤 환산 대상(conversion 있음)은
    // 정상 동작이라 제외. 종류 미지정 경고(위)가 이미 나가는 경우는 중복으로 내지 않는다.
    let unitMismatchWarning: string | undefined;
    if (!unresolvedLooksLikeThreadOrTape) {
      const reference = suggested ?? candidates[0];
      if (reference && lineUnit && !reference.conversion) {
        const a = normUnit(lineUnit);
        const b = normUnit(reference.unit);
        if (a && b && a !== b && !a.includes(b) && !b.includes(a)) {
          unitMismatchWarning = `자재 단위(${lineUnit})와 단가 단위(${reference.unit})가 다릅니다 — 환산해서 입력하세요.`;
        }
      }
    }

    // PR-188: 미도 브랜드가 아니면(또는 브랜드 미상이면) 왜 단가표 후보가 없는지 안내한다.
    const note = !isMidoBrand ? (brand ? NOT_MIDO_BRAND_NOTE : NO_BRAND_NOTE) : undefined;

    const result: PriceReferenceResult = {
      candidates,
      suggested,
      brand,
      ...(unitMismatchWarning ? { unitMismatchWarning } : {}),
      ...(unresolvedLooksLikeThreadOrTape ? { warning: MISSING_SUBTYPE_WARNING } : {}),
      ...(packagingUnitLabel ? { packagingUnitLabel } : {}),
      ...(note ? { note } : {}),
    };

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
