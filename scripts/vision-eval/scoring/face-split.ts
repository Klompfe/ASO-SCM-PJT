import type { BomMatchResult } from './bom-match';
import { normalizeItemName } from './bom-match';

// PR-199b(PILOT-2에서 확인): 정답에 "겉감(소재코드)" 한 줄이 있는데 AI가 같은 소재를
// 색상만 달리해 여러 행으로 돌려주면(색상코드가 다름) classifyBomItems 혼자서는
// MISSING(golden) + EXTRA_OTHER×N(ai)으로 잘못 잡는다. 이 함수는 그 결과를 후처리해
// "한 줄로 묶인 것"으로 다시 분류한다. 운영 코드의 표준 이름 사전(src/)은 건드리지
// 않고, 이 채점기 안에서만 처리한다.
const FABRIC_MARKERS = ['겉감', 'OUTSHELL', 'OUT-SHELL'];

function isFaceFabricGoldenName(name: string): boolean {
  // 한글 마커("겉감")는 보통 첫 줄에, 영문 마커("OUT-SHELL")는 줄바꿈 뒤 설명에 있을
  // 수 있어 전체 문자열에서 찾는다(이름 비교와 달리 여기는 "분류 판별"일 뿐이라
  // 영문 설명을 배제할 필요가 없다).
  const normalized = normalizeItemName(name ?? '').toUpperCase();
  return FABRIC_MARKERS.some((m) => normalized.includes(normalizeItemName(m).toUpperCase()));
}

const CONSUMPTION_TOLERANCE = 0.05;

export interface FaceSplitMergeResult {
  results: BomMatchResult[];
  faceSplitCount: number;
}

// 정답의 겉감 행이 MISSING으로 남아 있고, 색상코드(colorCode)가 있는 EXTRA_OTHER/
// EXTRA_DUPLICATE 행이 같은 소재로 보이는 값(같거나 허용오차 이내, 또는 미추출)으로
// 2개 이상 있으면 하나로 묶는다(2개 미만이면 "색상 분할"로 보기 애매해 그대로 둔다).
export function mergeFaceColorSplits(results: BomMatchResult[]): FaceSplitMergeResult {
  const output: BomMatchResult[] = [];
  const consumed = new Set<BomMatchResult>();
  let faceSplitCount = 0;

  for (const r of results) {
    if (consumed.has(r)) continue;
    if (r.type === 'MISSING' && r.golden && isFaceFabricGoldenName(r.golden.itemName)) {
      const goldenVal = Array.isArray(r.golden.consumption) ? r.golden.consumption[0] : r.golden.consumption;
      const candidates = results.filter(
        (x) =>
          !consumed.has(x) &&
          x !== r &&
          (x.type === 'EXTRA_OTHER' || x.type === 'EXTRA_DUPLICATE') &&
          x.ai &&
          x.ai.colorCode != null &&
          (x.ai.consumption == null || Math.abs((x.ai.consumption ?? 0) - goldenVal) < CONSUMPTION_TOLERANCE),
      );
      if (candidates.length >= 2) {
        candidates.forEach((c) => consumed.add(c));
        consumed.add(r);
        faceSplitCount++;
        output.push({ type: 'FACE_SPLIT_BY_COLOR', golden: r.golden, ai: candidates[0].ai });
        continue;
      }
    }
    output.push(r);
  }

  return { results: output, faceSplitCount };
}
