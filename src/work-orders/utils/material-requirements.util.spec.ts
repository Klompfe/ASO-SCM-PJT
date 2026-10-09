import { calculateMaterialRequirements } from './material-requirements.util';

const mat = (id: number, name: string) => ({ id, code: `M${id}`, name });
const bi = (id: number, material: any, consumption: unknown, category = '겉감', colorCode = 'BK') => ({ id, material, consumption, category, colorCode });

describe('BOM 소요량 계산 (PR-120)', () => {
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

    // PR-185 B: orderedQty는 호출자가 styleNo로 미리 걸러 넘긴 값이고, unlinkedOrderedQty는
    // 참고용으로만 집계되며 shortageQty 계산에서 차감되지 않는다.
    it('unlinkedOrderedQty는 참고로만 집계되고 부족분(shortageQty) 계산에서 차감하지 않는다', () => {
      const [row] = calculateMaterialRequirements(
        100,
        [bi(1, mat(10, 'A'), 1)],
        new Map([[10, 30]]), // styleNo로 걸러진 "이 스타일" 발주만
        { unlinkedByItemId: new Map([[10, 9999]]) }, // 스타일 미연결 발주(아무리 많아도 무시)
      );
      expect(row).toMatchObject({ requiredQty: 100, orderedQty: 30, unlinkedOrderedQty: 9999, shortageQty: 70 });
    });

    it('unlinkedByItemId를 안 주면 unlinkedOrderedQty는 0이다', () => {
      const [row] = calculateMaterialRequirements(10, [bi(1, mat(10, 'A'), 1)], new Map());
      expect(row.unlinkedOrderedQty).toBe(0);
    });
  });

  // PR-185 B-2: 실/테이프(Item.unit이 콘/롤) 자재는 미터가 아니라 콘/롤 단위로 환산한다.
  describe('실/테이프 콘·롤 환산', () => {
    const matUnit = (id: number, name: string, unit: string) => ({ id, code: `M${id}`, name, unit });
    const threadBi = (id: number, material: any, consumption: unknown, threadType: string | null, colorCode = 'BK') => ({
      id, material, consumption, category: '실', colorCode, threadType,
    });
    const tapeBi = (id: number, material: any, consumption: unknown, tapeType: string | null, colorCode = 'BK') => ({
      id, material, consumption, category: '테이프', colorCode, tapeType,
    });
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const coaRule = { materialSubType: 'COA_SA', packagingUnitLabel: '콘', unitLengthM: 2500 };
    const dadeRule = { materialSubType: 'DADE', packagingUnitLabel: '롤', unitLengthM: 50 };

    it('오바사 301,270m → 76콘(4,000m/콘)으로 환산되고 formula가 남는다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '오바사', 'CONE'), 301270, 'OBA_SA_SKU_I_SA')],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toMatchObject({ packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76 });
      expect(row.conversionWarning).toBeUndefined();
    });

    it('코아사 74,360m → 30콘(2,500m/콘)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '코아사', '콘'), 74360, 'COA_SA')],
        new Map(),
        { packagingRules: [coaRule] },
      );
      expect(row.packaging?.requiredPackages).toBe(30);
    });

    it('다데 테이프는 롤(50m/롤)로 환산된다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [tapeBi(1, matUnit(10, '다데', 'ROLL'), 125, 'DADE')],
        new Map(),
        { packagingRules: [dadeRule] },
      );
      expect(row.packaging).toMatchObject({ packagingUnitLabel: '롤', unitLengthM: 50, requiredPackages: 3 }); // 125/50=2.5→3
    });

    it('색상별로 올림한 합계가 전체 합산 올림과 다를 수 있다(색상별 올림이 실제 규칙)', () => {
      // 색상 A: 2001m → ceil(2001/2000)=2, 색상 B: 2001m → ceil(2001/2000)=2, 합계 4
      // 반면 전체를 먼저 합치면 4002m → ceil(4002/2000)=3 (다른 값) — 색상별 올림(4)이 맞다.
      const rule = { materialSubType: 'COA_SA', packagingUnitLabel: '콘', unitLengthM: 2000 };
      const [row] = calculateMaterialRequirements(
        1,
        [
          threadBi(1, matUnit(10, '코아사', '콘'), 2001, 'COA_SA', 'RED'),
          threadBi(2, matUnit(10, '코아사', '콘'), 2001, 'COA_SA', 'BLUE'),
        ],
        new Map(),
        { packagingRules: [rule] },
      );
      expect(row.packaging?.requiredPackages).toBe(4);
      expect(Math.ceil(4002 / 2000)).toBe(3); // 전체합산 올림(3)과 다름을 확인
    });

    it('종류 미지정(threadType 없음)이면 환산하지 않고 경고만 준다(추측 금지)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '미지정실', 'CONE'), 10000, null)],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
    });

    it('종류는 있지만 규칙 테이블에 없으면(데이터 누락) 환산하지 않고 같은 경고를 준다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '지누이도', 'CONE'), 10000, 'POLY_JINUIDO')],
        new Map(),
        { packagingRules: [obaRule, coaRule] }, // POLY_JINUIDO 규칙 없음
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
    });

    it('실/테이프가 아닌 자재(Item.unit이 콘/롤이 아님)는 packaging/conversionWarning 필드 자체가 없다', () => {
      const [row] = calculateMaterialRequirements(1, [bi(1, mat(10, '일반원단'), 5)], new Map());
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBeUndefined();
    });

    it('부족분(shortagePackages)은 콘/롤 단위로 차감한다(orderedQty가 이미 콘/롤 단위라고 가정)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '오바사', 'CONE'), 301270, 'OBA_SA_SKU_I_SA')],
        new Map([[10, 50]]), // 이미 50콘 발주(스타일 연결, 콘 단위)
        { packagingRules: [obaRule] },
      );
      expect(row.packaging?.requiredPackages).toBe(76);
      expect(row.packaging?.shortagePackages).toBe(26); // 76 - 50
    });
  });
});
