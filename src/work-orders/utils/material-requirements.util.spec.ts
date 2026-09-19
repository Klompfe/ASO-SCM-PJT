import { calculateMaterialRequirements, pickLatestBom } from './material-requirements.util';

const mat = (id: number, name: string) => ({ id, code: `M${id}`, name });
const bi = (id: number, material: any, consumption: unknown, category = '겉감', colorCode = 'BK') => ({ id, material, consumption, category, colorCode });

describe('BOM 소요량 계산 (PR-120)', () => {
  describe('pickLatestBom — 여러 BOM 중 최신 선택', () => {
    it('id가 가장 큰 것을 고른다(version/bomNo가 전부 같아도)', () => {
      const boms = [
        { id: 12, version: 'V1', bomNo: 'BOM-X-001' },
        { id: 51, version: 'V1', bomNo: 'BOM-X-001' },
        { id: 30, version: 'V1', bomNo: 'BOM-X-001' },
      ];
      expect(pickLatestBom(boms)!.id).toBe(51);
    });

    it('한 건이면 그대로, 없으면 null(원본 배열은 변하지 않는다)', () => {
      expect(pickLatestBom([{ id: 7 }])!.id).toBe(7);
      expect(pickLatestBom([])).toBeNull();
      const arr = [{ id: 2 }, { id: 1 }];
      pickLatestBom(arr);
      expect(arr.map((b) => b.id)).toEqual([2, 1]);
    });

    it('version 문자열이 더 커 보여도 id를 기준으로 한다(기존 재고 차감 로직과 같은 규칙)', () => {
      expect(pickLatestBom([{ id: 5, version: 'V9' }, { id: 6, version: 'V1' }])!.id).toBe(6);
    });
  });

  describe('calculateMaterialRequirements', () => {
    it('필요 총수량 = 제품 1개당 소요량 × 작업지시 물량', () => {
      const rows = calculateMaterialRequirements(1000, [bi(1, mat(10, '원단A'), 1.25), bi(2, mat(11, '단추'), '8')], new Map());
      expect(rows.map((r) => [r.itemName, r.consumptionPerUnit, r.requiredQty])).toEqual([
        ['원단A', 1.25, 1250],
        ['단추', 8, 8000],
      ]);
    });

    it('부족분 = 필요 - 이미 발주(일부만 발주된 경우), 발주가 없으면 필요 전체', () => {
      const rows = calculateMaterialRequirements(
        100,
        [bi(1, mat(10, 'A'), 2), bi(2, mat(11, 'B'), 3), bi(3, mat(12, 'C'), 1)],
        new Map([[10, 50], [11, 300]]),
      );
      expect(rows.map((r) => [r.requiredQty, r.orderedQty, r.shortageQty])).toEqual([
        [200, 50, 150], // 일부만 발주 → 부족 150
        [300, 300, 0], // 딱 맞게 발주 → 0
        [100, 0, 100], // 발주 없음 → 전량 부족
      ]);
    });

    it('이미 발주량이 필요량보다 많으면 부족분은 음수가 아니라 0', () => {
      const [row] = calculateMaterialRequirements(10, [bi(1, mat(10, 'A'), 1)], new Map([[10, 999]]));
      expect(row.shortageQty).toBe(0);
      expect(row.orderedQty).toBe(999);
    });

    it('같은 자재가 색상별로 여러 BOM 행이면 자재 기준으로 합치고, 발주량은 한 번만 차감한다', () => {
      const rows = calculateMaterialRequirements(
        100,
        [bi(1, mat(10, '원단A'), 1, '겉감', 'BK'), bi(2, mat(10, '원단A'), 0.5, '겉감', 'WH'), bi(3, mat(11, '안감'), 2, '안감', 'BK')],
        new Map([[10, 100]]),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ itemName: '원단A', consumptionPerUnit: 1.5, requiredQty: 150, orderedQty: 100, shortageQty: 50, lineCount: 2, colors: ['BK', 'WH'], categories: ['겉감'] });
    });

    it('부동소수 오차 없이 계산한다(0.1×3, 0.333×3)', () => {
      const rows = calculateMaterialRequirements(3, [bi(1, mat(10, 'A'), 0.1), bi(2, mat(11, 'B'), 0.333)], new Map());
      expect(rows.map((r) => r.requiredQty)).toEqual([0.3, 0.999]);
    });

    it('BOM 항목이 없거나 물량이 0/비정상이면 빈 결과 또는 0', () => {
      expect(calculateMaterialRequirements(100, [], new Map())).toEqual([]);
      const [row] = calculateMaterialRequirements(0, [bi(1, mat(10, 'A'), 2)], new Map());
      expect(row.requiredQty).toBe(0);
      expect(row.shortageQty).toBe(0);
      expect(calculateMaterialRequirements(NaN as any, [bi(1, mat(10, 'A'), 2)], new Map())[0].requiredQty).toBe(0);
    });

    it('자재 정보가 없는 BOM 행은 건너뛰고 BOM 행 순서(id 오름차순)를 유지한다', () => {
      const rows = calculateMaterialRequirements(1, [bi(3, mat(12, 'C'), 1), bi(1, mat(10, 'A'), 1), bi(2, null, 5)], new Map());
      expect(rows.map((r) => r.itemName)).toEqual(['A', 'C']);
    });
  });
});
