import type { MaterialRequirementPackaging } from './bomRequirementReport';

// PR-216: 테이프/실 필요량을 화면에 보여줄 때 "123.456콘"처럼 소수가 섞여 나오던 문제.
// material-requirements.util.ts(백엔드)는 이미 색상별로 Math.ceil한 정수를 더해
// requiredPackages를 만들어 두므로(계산 로직은 이 PR에서 바꾸지 않는다), 화면은 그
// 정수+단위를 그대로 보여주면 된다 — StyleShortagePanel은 이미 그렇게 하고 있었지만
// BomRequirementReport는 packaging 필드를 전혀 보지 않고 소수(fmt)만 보여주고 있었다.
// 이 한 함수로 양쪽을 통일한다.
const fmtDecimal = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

// PR-218: 포장단위가 없는 필요량도 더 이상 소수로 보여주지 않는다 — 정수로 올림한다
// (사용자 보고: "아직까지... 정수 올림 등의 로직이 적용되지 않았다"). 이 함수는 BOM
// 소요명세서 화면/엑셀 내보내기가 함께 쓰므로 한 곳만 고치면 양쪽에 반영된다 — "제품
// 1개당 소요량"(consumptionPerUnit, 비율값)에는 쓰지 않는다(그건 수량이 아니라 요척이라
// 올림 대상이 아니다).
export function formatRequirementQty(
  qty: number,
  packaging?: Pick<MaterialRequirementPackaging, 'requiredPackages' | 'packagingUnitLabel'> | null,
): string {
  if (packaging) return `${packaging.requiredPackages}${packaging.packagingUnitLabel}`;
  return ceilToInt(qty).toLocaleString('ko-KR');
}

// packaging이 없고 단순 개수(이미 발주/부족)일 때도 같은 규칙 — requiredPackages 대신
// 호출하는 쪽이 들고 있는 정수(예: shortagePackages)를 그대로 쓴다.
export function formatCountOrQty(
  qty: number,
  packagingCount: number | undefined,
  packagingUnitLabel: string | undefined,
): string {
  if (packagingCount != null && packagingUnitLabel) return `${packagingCount}${packagingUnitLabel}`;
  return ceilToInt(qty).toLocaleString('ko-KR');
}

// ---------------------------------------------------------------------------
// MATERIAL LIST 업로드 미리보기(MappingPreviewModal) 전용 — 이 화면의 행은 아직 저장된
// BomItem/Item이 아니라 엑셀에서 막 파싱한 값이라 threadType/tapeType/materialSubType이
// 없다. 종류를 자재명 문자열에서 추론해야 한다 — 백엔드 src/common/utils/packaging-
// subtype.util.ts의 looksLikeThreadOrTape/buildThreadTapeSuggestion과 같은 규칙을
// 미러링한다(프론트/백엔드가 별도 TS 프로젝트라 그대로 import할 수 없어 작은 순수
// 함수만 복제한다 — multiStyleBulkOrder.ts의 materialSubTypeLabel과 같은 기존 패턴).
export interface PackagingRuleLike {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
}

function displayNameTokens(displayName: string): string[] {
  return [displayName, ...displayName.split(/[·/]/)].map((t) => t.trim()).filter(Boolean);
}

const STANDALONE_SIL = /(^|[\s(),./\\-])실($|[\s(),./\\-])/;

export function looksLikeThreadOrTape(itemName: string | null | undefined, rules: PackagingRuleLike[]): boolean {
  const name = itemName ?? '';
  if (!name) return false;
  if (rules.some((r) => displayNameTokens(r.displayName).some((t) => name.includes(t)))) return true;
  const upper = name.toUpperCase();
  if (upper.includes('THREAD') || upper.includes('TAPE')) return true;
  if (name.includes('테이프')) return true;
  if (STANDALONE_SIL.test(name)) return true;
  return false;
}

export interface ThreadTapeSuggestion {
  materialSubType: string;
  displayName: string;
}

export function buildThreadTapeSuggestion(itemName: string | null | undefined, rules: PackagingRuleLike[]): ThreadTapeSuggestion | null {
  const name = itemName ?? '';
  const matches = rules
    .map((r) => ({ rule: r, token: displayNameTokens(r.displayName).find((t) => name.includes(t)) }))
    .filter((m): m is { rule: PackagingRuleLike; token: string } => !!m.token);
  if (matches.length !== 1) return null;
  return { materialSubType: matches[0].rule.materialSubType, displayName: matches[0].rule.displayName };
}

// 부동소수점 오차로 경계값(예: 2500.0000000001)에서 한 단위 더 올라가지 않게 하는 보정.
// 기존 계산 로직(material-requirements.util.ts)에는 이 보정이 없다 — 저장된 계산 결과는
// 건드리지 않고, 이 화면에서 새로 계산하는 값에만 적용한다.
const EPSILON = 1e-9;
export function ceilWithEpsilon(value: number, divisor: number): number {
  return Math.ceil(value / divisor - EPSILON);
}

// PR-218: "필요량이 보이는 모든 화면"에서 포장 규칙이 없는 값도 더 이상 소수로 보여주지
// 않는다 — 정수로 올림(ROUNDUP)한다. 원값은 필요하면 호출하는 쪽이 툴팁/흐린 글씨로 보조
// 표시한다(이 함수는 어느 쪽이든 원값을 함께 돌려준다).
export function ceilToInt(qty: number): number {
  // qty가 0(또는 EPSILON 보정으로 0보다 살짝 작아지는 값)이면 Math.ceil이 -0을 돌려준다 —
  // -0은 0과 값은 같지만 Object.is/toEqual이 다르게 본다(엑셀 내보내기 재파싱 테스트에서
  // 드러남). "|| 0"으로 -0을 0으로 정규화한다.
  return Math.ceil(qty - EPSILON) || 0;
}

export type RawRowPackaging =
  | { status: 'DETERMINED'; packages: number; unitLabel: string; displayName: string; formula: string }
  | { status: 'AMBIGUOUS'; warning: string }
  | { status: 'NOT_APPLICABLE' };

// MappingPreviewModal의 파싱 직후 행(threadType/tapeType 없음)에 대해, 자재명만으로
// 종류를 추론해 콘/롤 포장단위를 계산한다. 추론이 안 되면(0개/2개 이상 매칭) 계산을
// 포기하고 "종류 확인 필요" 경고만 낸다 — 추측해서 하나를 자동 확정하지 않는다
// (packaging-subtype.util.ts의 buildThreadTapeSuggestion과 같은 안전모드 원칙).
export function computeRawRowPackaging(itemName: string | null | undefined, requiredQty: number, rules: PackagingRuleLike[]): RawRowPackaging {
  if (!looksLikeThreadOrTape(itemName, rules)) return { status: 'NOT_APPLICABLE' };
  const suggestion = buildThreadTapeSuggestion(itemName, rules);
  if (!suggestion) return { status: 'AMBIGUOUS', warning: '실/테이프 종류 확인 필요 — 자재명에서 종류를 하나로 판별할 수 없습니다' };
  const rule = rules.find((r) => r.materialSubType === suggestion.materialSubType);
  if (!rule) return { status: 'AMBIGUOUS', warning: '실/테이프 종류 확인 필요 — 포장단위 규칙을 찾지 못했습니다' };
  const packages = ceilWithEpsilon(requiredQty, rule.unitLengthM);
  return {
    status: 'DETERMINED',
    packages,
    unitLabel: rule.packagingUnitLabel,
    displayName: rule.displayName,
    formula: `${requiredQty.toLocaleString('ko-KR')}m ÷ ${rule.unitLengthM}m/${rule.packagingUnitLabel} = ${packages}${rule.packagingUnitLabel}`,
  };
}

// ---------------------------------------------------------------------------
// PR-218: BomItem에 threadType/tapeType이 이미 저장돼 있는 화면(ItemsManager의 BOM
// 조회 등) 전용 — computeRawRowPackaging처럼 자재명에서 "추론"하지 않는다(이미 지정된
// 값이 있으니 추측할 필요가 없고, 추론은 오탐 위험이 있다 — 안전모드 원칙 유지).
// 종류가 비어 있을 때만 이름 기반 추론(looksLikeThreadOrTape)으로 "종류 지정 필요"
// 경고를 낸다. 포장 규칙은 미터(M) 단위를 전제하므로, 자재 단위가 다르면(Y 등) 환산하지
// 않고 "단위 확인 필요"만 보여준다(요구사항: Y↔M 환산 코드는 이번 PR에 넣지 않는다).
export type MaterialQtyDisplay =
  | { kind: 'PACKAGED'; text: string; formula: string; originalQty: number }
  | { kind: 'ROUNDED'; text: string; originalQty: number }
  | { kind: 'SUBTYPE_NEEDED'; text: string; warning: string; originalQty: number }
  | { kind: 'UNIT_MISMATCH'; text: string; warning: string; originalQty: number };

export function formatBomItemQty(
  qty: number,
  opts: { subtype?: string | null; itemName?: string | null; itemUnit?: string | null },
  rules: PackagingRuleLike[],
): MaterialQtyDisplay {
  const q = Number(qty) || 0;
  if (opts.subtype) {
    const rule = rules.find((r) => r.materialSubType === opts.subtype);
    if (rule) {
      const unit = (opts.itemUnit ?? '').trim().toUpperCase();
      if (unit && unit !== 'M') {
        return {
          kind: 'UNIT_MISMATCH',
          text: fmtDecimal(q),
          warning: `단위 확인 필요 — 포장단위 환산은 미터(M) 기준인데 이 자재 단위는 "${opts.itemUnit}"입니다`,
          originalQty: q,
        };
      }
      const packages = ceilWithEpsilon(q, rule.unitLengthM);
      return {
        kind: 'PACKAGED',
        text: `${packages}${rule.packagingUnitLabel}`,
        formula: `${q.toLocaleString('ko-KR')}m ÷ ${rule.unitLengthM}m/${rule.packagingUnitLabel} = ${packages}${rule.packagingUnitLabel}`,
        originalQty: q,
      };
    }
  } else if (looksLikeThreadOrTape(opts.itemName, rules)) {
    return {
      kind: 'SUBTYPE_NEEDED',
      text: fmtDecimal(q),
      warning: '실/테이프 종류 확인 필요 — 자재명에서 종류를 하나로 판별할 수 없습니다',
      originalQty: q,
    };
  }
  return { kind: 'ROUNDED', text: ceilToInt(q).toLocaleString('ko-KR'), originalQty: q };
}
