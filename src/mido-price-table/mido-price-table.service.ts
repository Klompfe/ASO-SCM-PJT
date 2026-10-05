import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MidoPriceItem } from './entities/mido-price-item.entity';
import { MaterialPackagingUnitRulesService } from '../material-packaging-unit-rules/material-packaging-unit-rules.service';
import { MaterialPackagingUnitRule } from '../material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
import { classifyPackagingUnit, convertMeterPriceToUnitPrice, type PackagingUnitCategory } from '../export-shipments/utils/meter-price-conversion.util';

// PR-157: PurchaseOrder.unitPrice(원화)가 없는 자재의 USD 단가 fallback. 아이템명
// 매칭이 완전히 일치하지 않을 수 있어(자재명세 표기 vs 단가표 표기) 자동으로 하나를
// 확정하지 않고, 느슨한 부분일치로 후보를 전부 반환한다 — 담당자가 화면에서 직접 골라
// 연결한다(PR-156의 "후보 전부 보여주고 자동 확정 금지" 원칙과 동일).

// PR-182: 환산 후보 — determined=true면 BomItem.threadType/tapeType으로 종류가 확정돼
// 환산 가능한 값이 하나뿐이고, false면(종류 미지정) 가능한 종류별 값을 전부 나열한다.
// 어느 쪽이든 서버는 하나를 자동으로 고르지 않는다(options 중 하나를 사람이 고른다).
export interface MeterPriceConversionOption {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  unitPriceUsd: number;
  formula: string;
  unitPriceUsdMax?: number;
  formulaMax?: string;
}

export interface MeterPriceConversionInfo {
  determined: boolean;
  options: MeterPriceConversionOption[];
  warning?: string;
  // PR-182 요구사항 C: 다데+암홀이 한 줄("TAPE 10MM")에 합쳐진 것으로 보이는(종류
  // 미지정) 롤 라인에만 참고 문구를 붙인다 — 과거 실제 INVOICE 청구 관행 안내.
  referenceNote?: string;
}

export interface MidoPriceCandidateWithConversion extends MidoPriceItem {
  conversion?: MeterPriceConversionInfo;
}

const MISSING_SUBTYPE_WARNING = '실/테이프 종류 미지정 — 선택해 주세요';
const TAPE_HISTORICAL_NOTE = '참고: 이전 INVOICE는 TAPE 10MM을 $0.04로 일괄 청구함(다데 기준)';

@Injectable()
export class MidoPriceTableService {
  constructor(
    @InjectRepository(MidoPriceItem)
    private readonly repository: Repository<MidoPriceItem>,
    private readonly packagingUnitRulesService: MaterialPackagingUnitRulesService,
  ) {}

  async findAll(): Promise<MidoPriceItem[]> {
    return this.repository.find({ order: { itemName: 'ASC' } });
  }

  // materialName의 각 "단어"(공백/괄호로 대충 쪼갠 토큰)가 단가표 itemName에 포함되어
  // 있으면 후보로 본다 — 완전 일치를 요구하면 "겉감(폴리에스터 57"/58" 혼방)" 같은
  // 표기 차이 때문에 후보가 하나도 안 나올 위험이 크다.
  //
  // PR-182: opts.lineUnit이 콘/롤이고 후보 단위가 M이면, material-packaging-unit-rules를
  // 조회해 콘/롤단가 환산 후보를 conversion으로 함께 붙인다. opts.materialSubType이
  // 있으면(BomItem.threadType/tapeType) 그 종류 하나로만 환산하고, 없으면 같은 포장
  // 단위(콘=실류/롤=테이프류) 범주의 모든 종류를 나열해 사람이 고르게 한다.
  async findCandidates(
    materialName: string,
    opts?: { lineUnit?: string; materialSubType?: string },
  ): Promise<MidoPriceCandidateWithConversion[]> {
    const all = await this.findAll();
    const tokens = materialName
      .replace(/[()"/,]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (tokens.length === 0) return [];

    const candidates = all.filter((item) => tokens.some((t) => item.itemName.includes(t)));

    const category = classifyPackagingUnit(opts?.lineUnit);
    if (!category) return candidates; // 라인 단위가 콘/롤이 아니면(M 등) 환산하지 않는다 — 기존 동작 그대로.

    const rules = await this.packagingUnitRulesService.findAll();
    return candidates.map((c) => {
      if (c.unit.toUpperCase() !== 'M') return c; // 단가표 단위가 M이 아니면 환산 대상이 아니다.
      return { ...c, conversion: this.buildConversion(c, category, rules, opts?.materialSubType) };
    });
  }

  private buildConversion(
    candidate: MidoPriceItem,
    category: PackagingUnitCategory,
    rules: MaterialPackagingUnitRule[],
    materialSubType: string | undefined,
  ): MeterPriceConversionInfo {
    const toOption = (rule: MaterialPackagingUnitRule): MeterPriceConversionOption => {
      const lengthM = Number(rule.unitLengthM);
      const min = convertMeterPriceToUnitPrice(Number(candidate.priceUsdMin), lengthM, rule.packagingUnitLabel);
      const differs = Number(candidate.priceUsdMax) !== Number(candidate.priceUsdMin);
      const max = differs ? convertMeterPriceToUnitPrice(Number(candidate.priceUsdMax), lengthM, rule.packagingUnitLabel) : null;
      return {
        materialSubType: rule.materialSubType,
        displayName: rule.displayName,
        packagingUnitLabel: rule.packagingUnitLabel,
        unitLengthM: lengthM,
        unitPriceUsd: min.unitPrice,
        formula: min.formula,
        ...(max ? { unitPriceUsdMax: max.unitPrice, formulaMax: max.formula } : {}),
      };
    };

    if (materialSubType) {
      const rule = rules.find((r) => r.materialSubType === materialSubType);
      if (rule) {
        return { determined: true, options: [toOption(rule)] };
      }
      // 종류는 알지만 포장단위 규칙이 없는 경우(데이터 누락) — 추측해서 환산하지 않고
      // 아래의 "미지정" 처리로 안전하게 넘어간다.
    }

    const categoryRules = rules.filter((r) => classifyPackagingUnit(r.packagingUnitLabel) === category);
    // 실(THREAD)처럼 종류와 무관하게 미터단가가 하나뿐이면(단가표에 후보가 한 줄) 그
    // 하나의 가격을 종류별 길이로 각각 곱해 전부 보여준다(스펙 예시와 동일). 반면
    // 테이프는 다데/암홀의 미터단가 자체가 다르므로(이 후보가 어느 미터단가인지는
    // candidate.itemName에 드러난다) 이 후보의 이름에 실제로 등장하는 종류로만
    // 좁힌다 — 그래야 "다데 가격 × 암홀 길이" 같은 틀린 조합을 보여주지 않는다.
    const nameMatchedRules = categoryRules.filter((r) => candidate.itemName.includes(r.displayName));
    const rulesToUse = nameMatchedRules.length > 0 ? nameMatchedRules : categoryRules;
    return {
      determined: false,
      options: rulesToUse.map(toOption),
      warning: MISSING_SUBTYPE_WARNING,
      ...(category === 'ROLL' ? { referenceNote: TAPE_HISTORICAL_NOTE } : {}),
    };
  }
}
