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
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const coaRule = { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 };
    const dadeRule = { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 };

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
      const rule = { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2000 };
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

  // PR-219: [A] 부족자재 표의 단위 불일치 버그 완화 — 종류 미지정이라 packaging이 없을
  // 때, 자재명 키워드로 추천된 종류가 있으면 "참고" 환산값(suggestedPackaging)을 함께
  // 계산해 둔다(packaging과 별개 필드 — 확정은 아니다).
  describe('PR-219: suggestedPackaging(종류 미지정 + 키워드 추천)', () => {
    const matUnit = (id: number, name: string, unit: string) => ({ id, code: `M${id}`, name, unit });
    const threadBi = (id: number, material: any, consumption: unknown, colorCode = 'BK') => ({
      id, material, consumption, category: '실', colorCode, threadType: null,
    });
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const coaRule = { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 };

    it('종류 미지정 + 이름이 "오바사"로 보임 → 참고로 76콘(4,000m/콘) 환산값을 함께 준다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '오바사 60S/3H THREAD', 'CONE'), 301270)],
        new Map([[10, 76]]), // 발주(스타일 연결) 76 — 콘 단위로 이미 들어온 값
        { packagingRules: [obaRule, coaRule] },
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
      expect(row.suggestedPackaging).toMatchObject({
        materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76, shortagePackages: 0,
      });
      // 사용자 보고 사례 재현: 미터 필요량(301,270)에서 콘 수(76)를 그대로 빼던 shortageQty는
      // 그대로 두되(필드 자체는 유지), 화면은 suggestedPackaging의 참고값(부족 0)을 쓴다.
      expect(row.shortageQty).toBe(301194); // 기존 shortageQty 필드(단위 불일치) — 화면이 이 값을 직접 쓰지 않도록 하는 것이 이번 PR의 프런트 변경.
    });

    it('추천이 없으면(키워드 미매칭) suggestedPackaging도 없다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '미지정실 THREAD', 'CONE'), 10000)],
        new Map(),
        { packagingRules: [obaRule, coaRule] },
      );
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
      expect(row.suggestedPackaging).toBeUndefined();
    });

    it('추천 종류가 있어도 규칙 테이블에 없으면(데이터 누락) suggestedPackaging이 없다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [threadBi(1, matUnit(10, '오바사', 'CONE'), 10000)],
        new Map(),
        { packagingRules: [coaRule] }, // OBA_SA_SKU_I_SA 규칙 없음
      );
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
      expect(row.suggestedPackaging).toBeUndefined();
    });

    it('색상별로 올림한 뒤 합산한다(확정 packaging과 같은 식)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [
          threadBi(1, matUnit(10, '오바사', 'CONE'), 4001, 'RED'),
          threadBi(2, matUnit(10, '오바사', 'CONE'), 4001, 'BLUE'),
        ],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.suggestedPackaging?.requiredPackages).toBe(4); // ceil(4001/4000)+ceil(4001/4000) = 2+2=4
    });

    it('종류가 확정된(packaging) 행은 suggestedPackaging이 생기지 않는다(기존 동작 유지)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [{ id: 1, material: matUnit(10, '오바사', 'CONE'), consumption: 301270, category: '실', colorCode: 'BK', threadType: 'OBA_SA_SKU_I_SA' }],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toBeDefined();
      expect(row.suggestedPackaging).toBeUndefined();
    });
  });

  // PR-186: BOM 행(threadType/tapeType)이 전부 미지정인 운영 데이터 문제 — 자재(Item) 단위로
  // 한 번만 종류를 지정해도(Item.unit이 'EA'여도) 환산되게 하는 Item-레벨 폴백 경로.
  describe('PR-186: 자재(Item) 단위 종류 지정 폴백', () => {
    const matSub = (id: number, name: string, materialSubType: string | null, opts: { unit?: string; packagingReviewedAt?: Date } = {}) => ({
      id, code: `M${id}`, name, unit: opts.unit, materialSubType, packagingReviewedAt: opts.packagingReviewedAt ?? null,
    });
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };

    it('Item.unit이 "EA"여도 Item.materialSubType이 지정돼 있으면 콘/롤로 환산한다', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [bi(1, matSub(10, '오바사', 'OBA_SA_SKU_I_SA', { unit: 'EA' }), 301270)],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toMatchObject({ packagingUnitLabel: '콘', unitLengthM: 4000, requiredPackages: 76 });
      expect(row.conversionWarning).toBeUndefined();
    });

    it('종류 미지정 + 이름이 실/테이프로 보이고 + 검토 안 함(packagingReviewedAt 없음) → 경고만, 미터 제안 없음', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [bi(1, matSub(10, '오바사 THREAD', null, { unit: 'EA' }), 301270)],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
    });

    it('검토완료(packagingReviewedAt 있음) + 종류 미지정 → "실/테이프 아님"으로 확정된 일반 자재, 경고 없음', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [bi(1, matSub(10, '오바사 THREAD', null, { unit: 'EA', packagingReviewedAt: new Date('2026-01-01') }), 301270)],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBeUndefined();
    });

    it('종류는 Item에 있으나 규칙 테이블에 없음(데이터 누락) → 경고', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [bi(1, matSub(10, '지누이도', 'POLY_JINUIDO', { unit: 'EA' }), 10000)],
        new Map(),
        { packagingRules: [obaRule] }, // POLY_JINUIDO 규칙 없음
      );
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
    });

    it('BOM 행의 threadType이 Item.materialSubType보다 우선한다', () => {
      const coaRule = { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 };
      const threadBi = { id: 1, material: matSub(10, '코아사', 'OBA_SA_SKU_I_SA', { unit: 'EA' }), consumption: 74360, category: '실', colorCode: 'BK', threadType: 'COA_SA' };
      const [row] = calculateMaterialRequirements(1, [threadBi], new Map(), { packagingRules: [obaRule, coaRule] });
      expect(row.packaging).toMatchObject({ packagingUnitLabel: '콘', unitLengthM: 2500, requiredPackages: 30 });
    });

    it('실/테이프로 보이지 않는 일반 자재는 검토 여부와 무관하게 경고가 없다', () => {
      const [row] = calculateMaterialRequirements(1, [bi(1, matSub(10, '일반원단', null, { unit: 'EA' }), 5)], new Map());
      expect(row.packaging).toBeUndefined();
      expect(row.conversionWarning).toBeUndefined();
    });

    // PR-194: 다품번 일괄발주 품목군 묶음 1순위 키 — Item.category(MaterialCategory).
    it('Item.category(MaterialCategory)가 있으면 itemCategoryName에 그대로 담긴다', () => {
      const materialWithCategory = { ...mat(10, '원단A'), category: { name: '원단류' } };
      const [row] = calculateMaterialRequirements(1, [bi(1, materialWithCategory, 1)], new Map());
      expect(row.itemCategoryName).toBe('원단류');
    });

    it('Item.category가 없으면 itemCategoryName은 null(화면이 BOM 구분으로 폴백)', () => {
      const [row] = calculateMaterialRequirements(1, [bi(1, mat(10, '원단A'), 1)], new Map());
      expect(row.itemCategoryName).toBeNull();
    });

    it('재시도 종류 코드(materialSubType)가 결과 행에 그대로 노출된다(섞이지 않으면)', () => {
      const coaRule = { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 };
      const threadBi = { id: 1, material: matSub(10, '코아사', 'COA_SA', { unit: 'EA' }), consumption: 1, category: '실', colorCode: 'BK' };
      const [row] = calculateMaterialRequirements(1, [threadBi], new Map(), { packagingRules: [coaRule] });
      expect(row.materialSubType).toBe('COA_SA');
    });

    it('같은 자재의 BOM 행마다 종류가 다르면(subtypeMixed) materialSubType은 null이다', () => {
      const rows = [
        { id: 1, material: matSub(10, '혼합자재', 'COA_SA', { unit: 'EA' }), consumption: 1, category: '실', colorCode: 'BK', threadType: 'COA_SA' },
        { id: 2, material: matSub(10, '혼합자재', 'COA_SA', { unit: 'EA' }), consumption: 1, category: '실', colorCode: 'WH', threadType: 'POLY_JINUIDO' },
      ];
      const [row] = calculateMaterialRequirements(1, rows, new Map());
      expect(row.materialSubType).toBeNull();
    });
  });

  // PR-220 0번: 1518 버그 원인 확정 + 재현. 사용자 보고(스타일 MB74BLM107Z, 겉감 BL/KH,
  // 각 요척 1.0, 작지 760/758, 스타일 기획수량 1,518)와 같은 모양의 합성 데이터로
  // material-requirements.util.ts:202(수정 전) `cur.requiredQty = round4(cur.requiredQty +
  // perUnit * target)`가 색상/행별 실제 수량과 무관하게 "스타일 전체 물량(target)"을
  // 모든 BOM 행에 그대로 곱하는 것을 재현한다 — BL/KH가 서로 다른 Item(실제 사용자
  // 사례: 색상이 품목명에 포함돼 품목 자체가 색상별로 나뉨, 예 "KHAKI KH")이든 같은
  // Item의 색상별 행(엑셀 업로드처럼 자재명은 같고 colorCode만 다름)이든 동일하게
  // 재현된다 — 원인은 "색상 행 합산" 자체가 아니라 "행마다 색상과 무관한 동일한
  // target을 곱한다"는 것이기 때문이다(아래 두 케이스 모두로 확인).
  describe('PR-220 0번: 1518 버그 원인 확정 (sheetQty 없는 데이터, 수정 전 동작 재현 + 수정 후 회귀 없음 확인)', () => {
    it('겉감이 색상별로 서로 다른 Item(사용자 실사례: "KHAKI KH" 등)이면 각 Item이 독립적으로 perUnit×target을 계산해 둘 다 1,518이 된다(sheetQty 없음 — 기존 계산, 회귀 없음 확인용)', () => {
      const rows = calculateMaterialRequirements(
        1518, // 스타일 기획수량(target) — 모든 행에 그대로 곱해진다(버그의 근원)
        [
          { id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
          { id: 2, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
        ],
        new Map(),
      );
      expect(rows.map((r) => [r.itemName, r.requiredQty])).toEqual([
        ['BLUE BL', 1518],
        ['KHAKI KH', 1518], // 사용자가 실제로 본 값 — 작지 인쇄값(758)이 아니라 스타일 전체 물량(1518)
      ]);
      // sheetQty가 없는 데이터이므로 이 PR의 수정으로 결과가 달라지면 안 된다(회귀 없음).
      expect(rows.every((r) => r.basis === 'computed')).toBe(true);
    });

    it('겉감이 같은 Item의 색상별 BOM 행(엑셀 업로드 모양)이면 두 행의 perUnit×target이 그대로 합산돼 3,036(=1518×2)이 된다(sheetQty 없음 — 이 역시 기존 계산, 이번 PR에서 고치는 대상이 아님)', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: mat(22, '겉감'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
          { id: 2, material: mat(22, '겉감'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
        ],
        new Map(),
      );
      expect(row.requiredQty).toBe(3036); // 1518 + 1518 — "같은 자재로 합산"은 올바르지만 각 행의 입력 자체가 이미 틀려 있다
      expect(row.basis).toBe('computed');
    });
  });

  // PR-220: sheetQty(작지 수량)가 있으면 그 값을 행의 필요량으로 쓴다 — 위 0번에서 확정한
  // 원인(행마다 색상과 무관한 target을 곱함)을, "그 행에 실제로 인쇄된 수량"으로 대체해
  // 고친다. 수용 기준 1·2(사용자 보고 사례 재현)와 3(sheetQty 없는 행은 회귀 없음, 위에서
  // 이미 확인)·4(단위 불일치 시 폴백+mismatch)를 테스트한다.
  describe('PR-220: sheetQty를 필요량에 반영 (단위 일치 시에만, 없으면 기존 계산으로 폴백)', () => {
    const matUnit = (id: number, name: string, unit: string) => ({ id, code: `M${id}`, name, unit });

    it('수용 기준: 겉감 BL/KH(요척 1.0, 작지 760/758, 기획수량 1518) — 각 Item의 필요량이 1518이 아니라 작지 그대로 760/758이 된다', () => {
      const rows = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: matUnit(20, 'BLUE BL', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'BL', sheetQty: 760, sheetQtyUnit: 'Y' },
          { id: 2, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 758, sheetQtyUnit: 'Y' },
        ],
        new Map(),
      );
      expect(rows.map((r) => [r.itemName, r.requiredQty, r.basis])).toEqual([
        ['BLUE BL', 760, 'sheet'],
        ['KHAKI KH', 758, 'sheet'],
      ]);
      expect(rows.every((r) => r.requiredQty !== 1518)).toBe(true);
    });

    it('[B] 발주 폼 수량 제안과 같은 경로이므로, 부족분도 작지 기준(760/758)으로 정확히 계산된다', () => {
      const rows = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 758, sheetQtyUnit: 'Y' }],
        new Map([[21, 700]]), // 이미 700Y 발주
      );
      expect(rows[0]).toMatchObject({ requiredQty: 758, orderedQty: 700, shortageQty: 58 });
    });

    it('단위가 다르면(행 단위 Y, 작지 단위 M) 추측 환산하지 않고 기존 계산으로 폴백한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 758, sheetQtyUnit: 'M' }],
        new Map(),
      );
      expect(row.requiredQty).toBe(1518); // 폴백 — sheetQty를 쓰지 않음
      expect(row.basis).toBe('computed');
    });

    it('단위가 불명(둘 중 하나라도 빈 값)이면 역시 폴백한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 758, sheetQtyUnit: null }],
        new Map(),
      );
      expect(row.requiredQty).toBe(1518);
      expect(row.basis).toBe('computed');
    });

    it('sheetQty가 0/음수/NaN이면(못 읽음 포함) 폴백한다', () => {
      for (const bad of [0, -1, NaN, null, undefined]) {
        const [row] = calculateMaterialRequirements(
          1518,
          [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: bad as any, sheetQtyUnit: 'Y' }],
          new Map(),
        );
        expect(row.requiredQty).toBe(1518);
        expect(row.basis).toBe('computed');
      }
    });

    it('computedQty는 basis와 무관하게 항상 제공된다(화면의 "계산수량" 비교용)', () => {
      const [sheetRow] = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 758, sheetQtyUnit: 'Y' }],
        new Map(),
      );
      expect(sheetRow.computedQty).toBe(1518); // 요척(1.0)×기획수량(1518)
      expect(sheetRow.sheetQty).toBe(758);

      const [computedRow] = calculateMaterialRequirements(1518, [bi(1, mat(21, 'KHAKI KH'), 1.0)], new Map());
      expect(computedRow.computedQty).toBe(1518);
      expect(computedRow.sheetQty).toBeUndefined();
    });

    it('작지 수량과 계산값이 크게 다르면(±5% 초과) mismatch: true로 확인 필요를 표시한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        // 계산값 1518, 작지 1200 — 차이율 약 21% > 5%
        [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH', sheetQty: 1200, sheetQtyUnit: 'Y' }],
        new Map(),
      );
      expect(row.mismatch).toBe(true);
      expect(row.requiredQty).toBe(1200); // mismatch여도 작지 수량을 그대로 쓴다(사람이 확인하라는 표시일 뿐, 자동으로 계산값으로 바꾸지 않음)
    });

    it('작지 수량이 계산값과 거의 같으면(5% 이내) mismatch: false', () => {
      const [row] = calculateMaterialRequirements(
        100,
        [{ id: 1, material: matUnit(21, 'A', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'A', sheetQty: 101, sheetQtyUnit: 'Y' }],
        new Map(),
      );
      expect(row.mismatch).toBe(false);
    });

    it('포장 환산(콘/롤)은 sheetQty 기준 입력으로도 기존 색상별 올림 순서를 그대로 따른다', () => {
      const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
      const rows = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: matUnit(30, '오바사', 'M'), consumption: 1.0, category: '실', colorCode: 'BL', threadType: 'OBA_SA_SKU_I_SA', sheetQty: 4001, sheetQtyUnit: 'M' },
          { id: 2, material: matUnit(30, '오바사', 'M'), consumption: 1.0, category: '실', colorCode: 'KH', threadType: 'OBA_SA_SKU_I_SA', sheetQty: 4001, sheetQtyUnit: 'M' },
        ],
        new Map(),
        { packagingRules: [obaRule] },
      );
      // 색상별 올림: ceil(4001/4000)=2, ceil(4001/4000)=2 → 합계 4 (전체 합산 올림이면 ceil(8002/4000)=3과 달라야 함)
      expect(rows[0].packaging?.requiredPackages).toBe(4);
      expect(rows[0].basis).toBe('sheet');
    });

    it('재업로드 등에서 일부 행만 sheetQty가 있으면(mixed) basis는 "mixed"이고 requiredQty는 행별로 올바른 값을 합산한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: matUnit(21, '혼합자재', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'BL', sheetQty: 760, sheetQtyUnit: 'Y' },
          { id: 2, material: matUnit(21, '혼합자재', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH' }, // sheetQty 없음 → 이 행은 계산값
        ],
        new Map(),
      );
      expect(row.basis).toBe('mixed');
      expect(row.requiredQty).toBe(760 + 1518); // BL은 작지(760), KH는 계산값(1×1518)
    });
  });
});
