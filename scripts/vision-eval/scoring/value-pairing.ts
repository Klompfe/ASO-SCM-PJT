import type { GoldenBomItem, AiBomItemLike } from '../types';
import type { BomMatchResult } from './bom-match';

// PR-199c(PILOT-3에서 확인): MISSING 129건 중 약 58건은 같은 페이지의 EXTRA 행과
// 구분·수량이 거의 같았다(이름 표기만 달라 사전 기반 짝짓기에 실패). 이름 짝짓기가
// 끝난 뒤 남은 MISSING/EXTRA 중에서 수량이 가까운 것끼리 보조로 짝짓는다 — OK나
// NAME_ABBREV로는 세지 않고 NAME_DIFF_PAIRED_BY_VALUE로 따로 세서 사람이 눈으로
// 검증하게 한다.
const VALUE_PAIR_TOLERANCE_RATIO = 0.05;

const consumptionOf = (c: number | number[]): number | null => {
  const v = Array.isArray(c) ? c[0] : c;
  return v == null ? null : v;
};

// GoldenBomItem에는 구분(category) 필드가 없다(types.ts 참고) — 정답 쪽에서 판별할
// 수단이 없으므로 "둘 다 판별 불가"로 보고 항상 호환으로 취급한다.
function categoryCompatible(_golden: GoldenBomItem, _ai: AiBomItemLike): boolean {
  return true;
}

// AiBomItemLike에는 단위 필드가 없다(프롬프트가 "단위 제외, 숫자만" 받도록 요청함) —
// AI 쪽에서 판별할 수단이 없으므로 "둘 다 판별 불가"로 보고 항상 호환으로 취급한다.
function unitCompatible(_golden: GoldenBomItem, _ai: AiBomItemLike): boolean {
  return true;
}

interface Candidate {
  missingIdx: number;
  extraIdx: number;
  diff: number;
}

function uniqueMinimum(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  const minDiff = Math.min(...candidates.map((c) => c.diff));
  const atMin = candidates.filter((c) => c.diff === minDiff);
  return atMin.length === 1 ? atMin[0] : null;
}

export interface ValuePairingOutcome {
  results: BomMatchResult[];
  pairedCount: number;
}

// 이름 사전 매칭 뒤(classifyBomItems → mergeFaceColorSplits → markImplicitMissing)
// 남은 MISSING/EXTRA_OTHER/EXTRA_DUPLICATE 중에서 수량(±5%)이 가깝고 구분·단위가
// 호환되는 쌍을 찾는다. 짝짓기는 서로가 서로의 "유일한 최선"일 때만 성립한다(동점이거나
// 후보가 여럿이면 짝짓지 않음) — 그래야 엉뚱한 쌍을 만들지 않는다.
export function pairMissingWithExtraByValue(results: BomMatchResult[]): ValuePairingOutcome {
  const missingIdx = results.reduce<number[]>((acc, r, i) => (r.type === 'MISSING' ? [...acc, i] : acc), []);
  const extraIdx = results.reduce<number[]>(
    (acc, r, i) => (r.type === 'EXTRA_OTHER' || r.type === 'EXTRA_DUPLICATE' ? [...acc, i] : acc),
    [],
  );

  const candidates: Candidate[] = [];
  for (const m of missingIdx) {
    const golden = results[m].golden;
    if (!golden) continue;
    const gCons = consumptionOf(golden.consumption);
    if (gCons == null) continue;
    for (const e of extraIdx) {
      const ai = results[e].ai;
      if (!ai || ai.consumption == null) continue;
      if (!categoryCompatible(golden, ai) || !unitCompatible(golden, ai)) continue;
      const diff = Math.abs(ai.consumption - gCons);
      const tolerance = Math.max(Math.abs(gCons), 1e-9) * VALUE_PAIR_TOLERANCE_RATIO;
      if (diff <= tolerance) candidates.push({ missingIdx: m, extraIdx: e, diff });
    }
  }

  const byMissing = new Map<number, Candidate[]>();
  const byExtra = new Map<number, Candidate[]>();
  for (const c of candidates) {
    byMissing.set(c.missingIdx, [...(byMissing.get(c.missingIdx) ?? []), c]);
    byExtra.set(c.extraIdx, [...(byExtra.get(c.extraIdx) ?? []), c]);
  }

  const pairs: Candidate[] = [];
  const usedMissing = new Set<number>();
  const usedExtra = new Set<number>();
  for (const m of missingIdx) {
    if (usedMissing.has(m)) continue;
    const bestFromMissing = uniqueMinimum(byMissing.get(m) ?? []);
    if (!bestFromMissing || usedExtra.has(bestFromMissing.extraIdx)) continue;
    const bestFromExtra = uniqueMinimum(byExtra.get(bestFromMissing.extraIdx) ?? []);
    if (!bestFromExtra || bestFromExtra.missingIdx !== m) continue;
    pairs.push(bestFromMissing);
    usedMissing.add(m);
    usedExtra.add(bestFromMissing.extraIdx);
  }

  if (pairs.length === 0) return { results, pairedCount: 0 };

  const removed = new Set<number>();
  for (const p of pairs) {
    removed.add(p.missingIdx);
    removed.add(p.extraIdx);
  }
  const kept = results.filter((_, i) => !removed.has(i));
  const paired = pairs.map((p) => ({
    type: 'NAME_DIFF_PAIRED_BY_VALUE' as const,
    golden: results[p.missingIdx].golden,
    ai: results[p.extraIdx].ai,
  }));

  return { results: [...kept, ...paired], pairedCount: pairs.length };
}
