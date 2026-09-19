import { describe, it, expect } from 'vitest';
import { currentBomId, isSelectionUnchanged, markDifferences, splitByReview, summarizeBoms, type DuplicateBom, type DuplicateBomStyle } from './bomDuplicateReview';

let itemId = 0;
const item = (materialId: number, consumption: number, materialName = `자재${materialId}`) => ({ id: ++itemId, materialId, materialCode: `M${materialId}`, materialName, category: '겉감', colorCode: 'BK', spec: 'S', consumption });
const bom = (id: number, isActive: boolean, items: ReturnType<typeof item>[]): DuplicateBom => ({ id, bomNo: 'BOM-1', version: 'V1', isActive, itemCount: items.length, items });
const style = (styleNo: string, boms: DuplicateBom[], over: Partial<DuplicateBomStyle> = {}): DuplicateBomStyle => ({
  styleNo, bomCount: boms.length, activeCount: boms.filter((b) => b.isActive).length, identical: false, sameByName: false, needsReview: true, boms, ...over,
});

describe('BOM 중복 검토 화면 유틸 (PR-121)', () => {
  it('현재 사용 중인 BOM = 활성 중 최신, 활성이 없으면 전체 중 최신(서버 규칙과 동일)', () => {
    expect(currentBomId(style('A', [bom(5, true, []), bom(116, false, [])]))).toBe(5);
    expect(currentBomId(style('A', [bom(5, true, []), bom(116, true, [])]))).toBe(116);
    expect(currentBomId(style('A', [bom(5, false, []), bom(116, false, [])]))).toBe(116);
  });

  it('선택이 이미 유일한 활성 BOM이면 "변경 없음"', () => {
    const s = style('A', [bom(5, true, []), bom(116, false, [])]);
    expect(isSelectionUnchanged(s, 5)).toBe(true);
    expect(isSelectionUnchanged(s, 116)).toBe(false);
    const both = style('B', [bom(1, true, []), bom(2, true, [])]);
    expect(isSelectionUnchanged(both, 2)).toBe(false); // 활성이 2건이면 하나로 정리하는 저장이 필요
  });

  it('두 BOM을 비교해 한쪽에만 있거나 소요량이 다른 행만 차이로 표시한다', () => {
    const a = bom(5, true, [item(1, 1.0), item(2, 0.5), item(3, 4)]);
    const b = bom(116, false, [item(1, 1.0), item(2, 0.7), item(4, 2)]);
    const marks = markDifferences([a, b]);
    // a: 자재1(1.0) 공통 / 자재2(0.5) 소요량이 달라 차이 / 자재3 없음 → 차이
    expect([...marks.get(5)!].length).toBe(2);
    expect(a.items.filter((i) => marks.get(5)!.has(i.id)).map((i) => i.materialId)).toEqual([2, 3]);
    expect(b.items.filter((i) => marks.get(116)!.has(i.id)).map((i) => i.materialId)).toEqual([2, 4]);
  });

  it('완전히 같은 BOM은 차이 행이 없다, 같은 조합이 여러 번 나오면 개수까지 맞아야 공통', () => {
    const same1 = bom(1, true, [item(1, 2), item(2, 3)]);
    const same2 = bom(2, false, [item(2, 3), item(1, 2)]);
    expect(markDifferences([same1, same2]).get(1)!.size).toBe(0);
    expect(markDifferences([same1, same2]).get(2)!.size).toBe(0);

    const twice = bom(3, true, [item(1, 2), item(1, 2)]);
    const once = bom(4, false, [item(1, 2)]);
    const m = markDifferences([twice, once]);
    expect(m.get(3)!.size).toBe(1); // 두 번째 행은 다른 쪽에 대응되는 행이 없다
    expect(m.get(4)!.size).toBe(0);
  });

  it('3건 이상 비교: 다른 BOM 전부에 있어야 공통', () => {
    const a = bom(1, true, [item(1, 1), item(2, 1)]);
    const b = bom(2, true, [item(1, 1), item(2, 1)]);
    const c = bom(3, true, [item(1, 1)]);
    const m = markDifferences([a, b, c]);
    expect(a.items.filter((i) => m.get(1)!.has(i.id)).map((i) => i.materialId)).toEqual([2]);
    expect(m.get(3)!.size).toBe(0);
  });

  it('BOM별 요약: 항목 수, 소요량 합(부동소수 오차 없이), 차이 행 수', () => {
    const s = style('MB72BLM102Z', [bom(5, true, [item(1, 0.1), item(2, 0.2), item(3, 0.3)]), bom(116, false, [item(1, 0.1)])]);
    expect(summarizeBoms(s)).toEqual([
      { bomId: 5, itemCount: 3, consumptionSum: 0.6, differingItemCount: 2 },
      { bomId: 116, itemCount: 1, consumptionSum: 0.1, differingItemCount: 0 },
    ]);
  });

  it('검토 필요 / 완전 동일 중복으로 나눈다(원래 순서 유지)', () => {
    const list = [style('A', [], { needsReview: true }), style('B', [], { needsReview: false, identical: true }), style('C', [], { needsReview: true })];
    const { needsReview, identical } = splitByReview(list);
    expect(needsReview.map((s) => s.styleNo)).toEqual(['A', 'C']);
    expect(identical.map((s) => s.styleNo)).toEqual(['B']);
  });

  it('이름은 같고 자재 레코드만 다른 행: 레코드 기준으로는 차이, 이름 기준으로는 공통(실제 MB6YSLM115Z 패턴)', () => {
    const a = bom(1, false, [item(1, 0.5, '(싸개패드)\n다후다'), item(2, 3, '단추')]);
    const b = bom(49, true, [item(110, 0.5, '(싸개패드)\r\n다후다'), item(2, 3, '단추')]);
    expect(markDifferences([a, b], 'record').get(1)!.size).toBe(1);
    expect(markDifferences([a, b], 'name').get(1)!.size).toBe(0);
    expect(markDifferences([a, b], 'name').get(49)!.size).toBe(0);
    // 요약의 "다른 행"은 실질 내용 차이만 센다
    expect(summarizeBoms(style('MB6YSLM115Z', [a, b])).map((x) => x.differingItemCount)).toEqual([0, 0]);
  });

  it('이름 기준에서도 소요량이 다르면 차이', () => {
    const a = bom(1, true, [item(1, 0.5, '다후다')]);
    const b = bom(2, false, [item(9, 0.6, '다후다')]);
    expect(markDifferences([a, b], 'name').get(1)!.size).toBe(1);
  });
});
