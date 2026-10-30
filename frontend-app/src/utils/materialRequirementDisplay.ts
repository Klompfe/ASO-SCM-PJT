import type { MaterialRequirementPackaging } from './bomRequirementReport';

// PR-216: 테이프/실 필요량을 화면에 보여줄 때 "123.456콘"처럼 소수가 섞여 나오던 문제.
// material-requirements.util.ts(백엔드)는 이미 색상별로 Math.ceil한 정수를 더해
// requiredPackages를 만들어 두므로(계산 로직은 이 PR에서 바꾸지 않는다), 화면은 그
// 정수+단위를 그대로 보여주면 된다 — StyleShortagePanel은 이미 그렇게 하고 있었지만
// BomRequirementReport는 packaging 필드를 전혀 보지 않고 소수(fmt)만 보여주고 있었다.
// 이 한 함수로 양쪽을 통일한다.
const fmtDecimal = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

export function formatRequirementQty(
  qty: number,
  packaging?: Pick<MaterialRequirementPackaging, 'requiredPackages' | 'packagingUnitLabel'> | null,
): string {
  if (packaging) return `${packaging.requiredPackages}${packaging.packagingUnitLabel}`;
  return fmtDecimal(qty);
}

// packaging이 없고 단순 개수(이미 발주/부족)일 때도 같은 규칙 — requiredPackages 대신
// 호출하는 쪽이 들고 있는 정수(예: shortagePackages)를 그대로 쓴다.
export function formatCountOrQty(
  qty: number,
  packagingCount: number | undefined,
  packagingUnitLabel: string | undefined,
): string {
  if (packagingCount != null && packagingUnitLabel) return `${packagingCount}${packagingUnitLabel}`;
  return fmtDecimal(qty);
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
