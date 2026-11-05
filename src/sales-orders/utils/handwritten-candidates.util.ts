// PR-223 (PILOT-21 설계안 기반): 작지 표 밖(라벨/장식 칸 여백, 스케치 주변 포함)
// 손글씨 중 자재로 보이는 것을 AI가 읽으면 vision.service.ts의 RESPONSE_SCHEMA가
// handwrittenCandidates 배열에 담는다. 자동으로 BOM(bomItems)에 넣지 않고, 이 순수
// 함수가 형식만 정리해(개수/길이 상한, 이미 bomItems에 있는 이름과 중복 제거) 그대로
// 프런트까지 전달한다 — 저장(commit) 경로는 이 필드를 읽지 않는다.
export interface HandwrittenCandidate {
  rawText: string;
  name: string | null;
  spec: string | null;
  color: string | null;
  // PR-220의 consumption(요척)/requiredQty+requiredQtyUnit(작지수량, sheetQty 기준)과
  // 이름을 그대로 맞췄다 — "자재 행으로 추가" 시 AiBomItemDto의 같은 이름 필드로 그대로
  // 복사하면 되게(필드명 변환 없이), PR-220의 sheetQty 규칙과 일관되게 쓰기 위함.
  consumption: number | null;
  requiredQty: number | null;
  requiredQtyUnit: string | null;
  locationHint: string | null;
}

const MAX_CANDIDATES = 10;
const MAX_FIELD_LEN = 300;

const truncate = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_FIELD_LEN ? t.slice(0, MAX_FIELD_LEN) : t;
};

const toFiniteNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// checkUnknownName(vision-guardrails.util.ts)과 같은 정규화 원칙(공백·대소문자·괄호 무시).
const normalizeNameForDedup = (s: string | null | undefined): string =>
  (s ?? '').replace(/[\s()<>[\]]/g, '').toUpperCase();

// 모델 응답이 없거나(undefined/null) 형식이 틀려도(배열이 아님, 항목이 객체가 아님)
// 예외를 던지지 않고 빈 배열로 취급한다 — 업로드 자체는 항상 성공해야 한다.
export function sanitizeHandwrittenCandidates(
  raw: unknown,
  bomItemNames: (string | null | undefined)[],
): HandwrittenCandidate[] {
  if (!Array.isArray(raw)) return [];
  const knownNames = new Set(bomItemNames.map(normalizeNameForDedup).filter(Boolean));

  const result: HandwrittenCandidate[] = [];
  for (const entry of raw) {
    if (result.length >= MAX_CANDIDATES) break;
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;

    const rawText = truncate(item.rawText);
    if (!rawText) continue; // rawText 없으면 후보로 인정하지 않는다(표시할 원문이 없음).

    const name = truncate(item.name);
    // 이미 자재 표 행(bomItems)으로 읽힌 것과 같은 이름이면 중복이므로 제외한다.
    if (name && knownNames.has(normalizeNameForDedup(name))) continue;

    result.push({
      rawText,
      name,
      spec: truncate(item.spec),
      color: truncate(item.color),
      consumption: toFiniteNumber(item.consumption),
      requiredQty: toFiniteNumber(item.requiredQty),
      requiredQtyUnit: truncate(item.requiredQtyUnit),
      locationHint: truncate(item.locationHint),
    });
  }
  return result;
}
