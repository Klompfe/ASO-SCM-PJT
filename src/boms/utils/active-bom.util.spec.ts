import { areBomContentsIdentical, bomContentSignature, normalizeMaterialName, pickActiveBom } from './active-bom.util';

describe('활성 BOM 선택 (PR-121)', () => {
  describe('pickActiveBom', () => {
    it('전부 활성이면 id가 가장 큰 것(= 이전 동작과 같다), version/bomNo가 같아도', () => {
      const boms = [
        { id: 12, isActive: true, version: 'V1' },
        { id: 51, isActive: true, version: 'V1' },
        { id: 30, isActive: true, version: 'V1' },
      ];
      expect(pickActiveBom(boms)!.id).toBe(51);
    });

    it('id가 더 큰 BOM이 비활성이면 활성인 것을 고른다(사용자가 예전 BOM을 선택한 경우)', () => {
      expect(pickActiveBom([{ id: 5, isActive: true }, { id: 116, isActive: false }])!.id).toBe(5);
    });

    it('활성이 여러 건이면 그중 가장 최신', () => {
      expect(pickActiveBom([{ id: 1, isActive: true }, { id: 7, isActive: false }, { id: 4, isActive: true }])!.id).toBe(4);
    });

    it('활성이 하나도 없으면 "BOM 없음"이 되지 않도록 전체 중 최신으로 대체', () => {
      expect(pickActiveBom([{ id: 3, isActive: false }, { id: 9, isActive: false }])!.id).toBe(9);
    });

    it('isActive 값이 없는 객체는 활성으로 본다, 빈 배열은 null, 원본 배열은 바뀌지 않는다', () => {
      expect(pickActiveBom([{ id: 2 }, { id: 6 }])!.id).toBe(6);
      expect(pickActiveBom([])).toBeNull();
      const arr = [{ id: 2, isActive: true }, { id: 1, isActive: true }];
      pickActiveBom(arr);
      expect(arr.map((b) => b.id)).toEqual([2, 1]);
    });
  });

  describe('BOM 내용 비교(검토 필요 여부)', () => {
    const items = (...rows: [number, unknown][]) => rows.map(([materialId, consumption]) => ({ materialId, consumption }));

    it('자재/소요량 조합이 같으면 행 순서·문자열 decimal이 달라도 동일', () => {
      const a = { items: items([1, 1.25], [2, '0.8']) };
      const b = { items: items([2, 0.8], [1, '1.2500']) };
      expect(areBomContentsIdentical([a, b])).toBe(true);
    });

    it('소요량이 다르거나 자재가 다르거나 항목 수가 다르면 다름', () => {
      const base = { items: items([1, 1], [2, 2]) };
      expect(areBomContentsIdentical([base, { items: items([1, 1], [2, 2.5]) }])).toBe(false);
      expect(areBomContentsIdentical([base, { items: items([1, 1], [3, 2]) }])).toBe(false);
      expect(areBomContentsIdentical([base, { items: items([1, 1]) }])).toBe(false);
    });

    it('3건 중 하나만 달라도 다름, 1건 이하는 비교 대상 아님(동일 취급)', () => {
      const same = { items: items([1, 1]) };
      expect(areBomContentsIdentical([same, same, { items: items([1, 2]) }])).toBe(false);
      expect(areBomContentsIdentical([same])).toBe(true);
      expect(areBomContentsIdentical([])).toBe(true);
    });

    it('같은 자재의 서로 다른 소요량 두 행은 하나로 뭉개지지 않는다', () => {
      expect(bomContentSignature(items([1, 1], [1, 2]))).not.toBe(bomContentSignature(items([1, 3])));
    });

    it('이름 정규화: 줄바꿈(\\n, \\r\\n)·연속 공백만 다른 이름은 같은 자재로 본다(실제 MB6YSLM115Z 사례)', () => {
      expect(normalizeMaterialName('(싸개패드)\n다후다')).toBe(normalizeMaterialName('(싸개패드)\r\n다후다'));
      expect(normalizeMaterialName('  다후다   LINING ')).toBe('다후다 LINING');
      expect(normalizeMaterialName(null)).toBe('');
      expect(normalizeMaterialName('다후다')).not.toBe(normalizeMaterialName('다우다'));
    });

    it('Item id로는 다르지만 정규화한 이름+소요량으로는 같은 BOM을 구분해서 판정할 수 있다', () => {
      const byId = (rows: [number, number][]) => ({ items: rows.map(([materialId, consumption]) => ({ materialId, consumption })) });
      const byName = (rows: [string, number][]) => ({ items: rows.map(([n, consumption]) => ({ materialId: normalizeMaterialName(n), consumption })) });
      expect(areBomContentsIdentical([byId([[1, 0.5]]), byId([[110, 0.5]])])).toBe(false); // 다른 Item 레코드
      expect(areBomContentsIdentical([byName([['다후다\nLINING', 0.5]]), byName([['다후다\r\nLINING', 0.5]])])).toBe(true);
      expect(areBomContentsIdentical([byName([['다후다', 0.5]]), byName([['다후다', 0.6]])])).toBe(false); // 소요량이 다르면 이름이 같아도 다름
    });
  });
});
