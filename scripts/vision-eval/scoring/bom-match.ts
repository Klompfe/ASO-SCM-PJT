import type { GoldenBomItem, AiBomItemLike, FieldErrorType, DigitConfusionPair } from '../types';
import { levenshteinDistance } from '../manifest.util';

// PR-199: 이름을 정규화(공백·괄호·꺾쇠 제거)해 표준 이름 사전으로 분류한다. 사전에
// 있는 핵심 단어가 포함돼 있으면 그 그룹, 없으면(오독으로 핵심 단어까지 깨졌을 때)
// 사전 키와의 편집거리가 가까우면(≤2) 그 그룹으로 느슨하게 묶는다(겉고리↔걸고리 같은
// 1글자 오독도 같은 그룹으로 짝지어야 "이름이 다른 같은 행"으로 비교할 수 있다).
// 둘 다 아니면 정규화된 이름 자체가 그룹(정확히 같은 이름만 묶임 — 과도한 병합 방지).
export function normalizeItemName(name: string): string {
  return (name ?? '').replace(/[\s()<>[\]]/g, '');
}

const STANDARD_NAME_KEYS = ['본봉', '코아', '오바', '스쿠이', '지누이', '다데', '암홀', '비바', '안감', '심지', '지퍼', '걸고리', '단추', '패드'];
const GROUP_DISTANCE_THRESHOLD = 2;

export function standardGroupOf(name: string): string {
  const normalized = normalizeItemName(name);
  let best: { key: string; distance: number } | null = null;
  for (const key of STANDARD_NAME_KEYS) {
    if (normalized.includes(key)) return key;
    const d = levenshteinDistance(normalized, key);
    if (!best || d < best.distance) best = { key, distance: d };
  }
  if (best && best.distance <= GROUP_DISTANCE_THRESHOLD) return best.key;
  return normalized;
}

// 숫자만 자리별로 비교한다(길이가 다르면 자리 비교가 의미 없어 통째로만 기록).
export function digitDiff(goldenValue: number, readValue: number): DigitConfusionPair[] {
  const g = String(goldenValue);
  const r = String(readValue);
  if (g.length !== r.length) return [{ golden: g, read: r }];
  const pairs: DigitConfusionPair[] = [];
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== r[i] && /[0-9]/.test(g[i]) && /[0-9]/.test(r[i])) pairs.push({ golden: g[i], read: r[i] });
  }
  return pairs;
}

export interface BomMatchResult {
  type: FieldErrorType;
  golden?: GoldenBomItem;
  ai?: AiBomItemLike;
  digitDiff?: DigitConfusionPair[];
}

const goldenConsumption = (item: GoldenBomItem): number =>
  Array.isArray(item.consumption) ? item.consumption[0] : item.consumption;

// PR-199: 항목 매칭·채점 — 표준 이름 사전으로 분류 후 같은 분류끼리 짝짓고(여럿이면
// 요척이 가장 가까운 것끼리), OK/VALUE_DIFF/NAME_DIFF/EXTRA_DUPLICATE/EXTRA_OTHER/
// MISSING으로 분류한다. 라벨 구역(MAIN+SIZE 이후, isLabelZone)은 요척 비교에서
// 제외하고 호출하는 쪽이 "존재 여부"만 따로 센다(이 함수는 다루지 않음).
export function classifyBomItems(golden: GoldenBomItem[], ai: AiBomItemLike[]): BomMatchResult[] {
  const comparableGolden = golden.filter((g) => !g.isLabelZone);
  const results: BomMatchResult[] = [];
  const usedAi = new Set<number>();

  for (const g of comparableGolden) {
    const group = standardGroupOf(g.itemName);
    const gConsumption = goldenConsumption(g);
    const candidates = ai
      .map((item, idx) => ({ item, idx }))
      .filter(({ item, idx }) => !usedAi.has(idx) && standardGroupOf(item.itemName) === group);

    if (candidates.length === 0) {
      results.push({ type: 'MISSING', golden: g });
      continue;
    }

    candidates.sort(
      (a, b) => Math.abs((a.item.consumption ?? 0) - gConsumption) - Math.abs((b.item.consumption ?? 0) - gConsumption),
    );
    const best = candidates[0];
    usedAi.add(best.idx);

    const sameName = normalizeItemName(best.item.itemName) === normalizeItemName(g.itemName);
    const sameValue = Math.abs((best.item.consumption ?? 0) - gConsumption) < 1e-9;

    if (sameName && sameValue) {
      results.push({ type: 'OK', golden: g, ai: best.item });
    } else if (!sameValue) {
      results.push({ type: 'VALUE_DIFF', golden: g, ai: best.item, digitDiff: digitDiff(gConsumption, best.item.consumption ?? 0) });
    } else {
      results.push({ type: 'NAME_DIFF', golden: g, ai: best.item });
    }
  }

  // 매칭된 golden 값들을 그룹별로 모아 두고, 남은 AI 행이 그 값과 같으면 "중복"으로 본다.
  const matchedValuesByGroup = new Map<string, number[]>();
  for (const r of results) {
    if (r.golden) {
      const group = standardGroupOf(r.golden.itemName);
      const list = matchedValuesByGroup.get(group) ?? [];
      list.push(goldenConsumption(r.golden));
      matchedValuesByGroup.set(group, list);
    }
  }

  ai.forEach((item, idx) => {
    if (usedAi.has(idx)) return;
    const group = standardGroupOf(item.itemName);
    const existing = matchedValuesByGroup.get(group) ?? [];
    const isDuplicateValue = existing.some((v) => Math.abs(v - (item.consumption ?? 0)) < 1e-9);
    results.push({ type: isDuplicateValue ? 'EXTRA_DUPLICATE' : 'EXTRA_OTHER', ai: item });
    existing.push(item.consumption ?? 0);
    matchedValuesByGroup.set(group, existing);
  });

  return results;
}

// 라벨 구역(필수 소모품)은 요척을 비교하지 않고 "존재 여부"만 센다.
export function checkLabelZonePresence(golden: GoldenBomItem[], ai: AiBomItemLike[]): { itemName: string; present: boolean }[] {
  const labelItems = golden.filter((g) => g.isLabelZone);
  const aiNames = ai.map((a) => standardGroupOf(a.itemName));
  return labelItems.map((g) => ({ itemName: g.itemName, present: aiNames.includes(standardGroupOf(g.itemName)) }));
}
