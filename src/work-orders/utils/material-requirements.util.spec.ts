import { calculateMaterialRequirements } from './material-requirements.util';

const mat = (id: number, name: string) => ({ id, code: `M${id}`, name });
// PR-220b: 기본 colorCode를 ''(공통/FREE 취급)으로 둔다 — 색상 비교 로직이 생기기 전에는
// 'BK'가 그냥 플레이스홀더였을 뿐 의미가 없었고, 이제는 "색상 있는 행"으로 해석되어
// 수량표/작지 수량 근거가 없으면 needsColorQty가 된다. 색상별 동작을 실제로 테스트하는
// 곳은 명시적으로 colorCode를 넘긴다(그리고 sheetQty/colorQuantities로 근거를 함께 준다).
const bi = (id: number, material: any, consumption: unknown, category = '겉감', colorCode = '') => ({ id, material, consumption, category, colorCode });

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
      // PR-220b: BK/WH는 색상이 있는 행이라 색상×사이즈 수량표(colorQuantities) 근거가
      // 있어야 숫자가 나온다 — BK=100, WH=100(요척 0.5라 기여분은 50)을 준다.
      const rows = calculateMaterialRequirements(
        100,
        [bi(1, mat(10, '원단A'), 1, '겉감', 'BK'), bi(2, mat(10, '원단A'), 0.5, '겉감', 'WH'), bi(3, mat(11, '안감'), 2, '안감', 'BK')],
        new Map([[10, 100]]),
        { colorQuantities: [{ color: 'BK', qty: 100 }, { color: 'WH', qty: 100 }] },
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ itemName: '원단A', consumptionPerUnit: 1.5, requiredQty: 150, orderedQty: 100, shortageQty: 50, lineCount: 2, colors: ['BK', 'WH'], categories: ['겉감'], basis: 'color-qty' });
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
    // PR-220b: 기본 colorCode를 ''(공통)으로 둔다 — 이 describe의 단일 행 테스트는 target=1
    // 트릭으로 consumption을 그대로 미터값으로 쓰므로 색상 로직과 무관하다. 색상을 실제로
    // 비교하는 테스트(아래 "색상별로 올림한 합계...")만 명시적으로 색상+sheetQty를 준다.
    const threadBi = (id: number, material: any, consumption: unknown, threadType: string | null, colorCode = '') => ({
      id, material, consumption, category: '실', colorCode, threadType,
    });
    const tapeBi = (id: number, material: any, consumption: unknown, tapeType: string | null, colorCode = '') => ({
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
      // PR-220b: 색상이 있는 행이라 sheetQty(단위 일치)로 근거를 준다 — target=1 트릭으로
      // consumption을 그대로 미터값으로 쓰던 이 테스트의 의도(색상별 올림 검증)를 그대로 유지.
      const [row] = calculateMaterialRequirements(
        1,
        [
          { ...threadBi(1, matUnit(10, '코아사', '콘'), 2001, 'COA_SA', 'RED'), sheetQty: 2001, sheetQtyUnit: '콘' },
          { ...threadBi(2, matUnit(10, '코아사', '콘'), 2001, 'COA_SA', 'BLUE'), sheetQty: 2001, sheetQtyUnit: '콘' },
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
    // PR-220b: 기본 colorCode ''(공통) — 단일 행 target=1 트릭 테스트는 색상과 무관.
    const threadBi = (id: number, material: any, consumption: unknown, colorCode = '') => ({
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
      // PR-220b: 색상이 있는 행이라 sheetQty로 근거를 준다(이 종류는 미지정이라
      // packaging이 아니라 suggestedPackaging 경로이지만, 색상 로직은 공통).
      const [row] = calculateMaterialRequirements(
        1,
        [
          { ...threadBi(1, matUnit(10, '오바사', 'CONE'), 4001, 'RED'), sheetQty: 4001, sheetQtyUnit: 'CONE' },
          { ...threadBi(2, matUnit(10, '오바사', 'CONE'), 4001, 'BLUE'), sheetQty: 4001, sheetQtyUnit: 'CONE' },
        ],
        new Map(),
        { packagingRules: [obaRule] },
      );
      expect(row.suggestedPackaging?.requiredPackages).toBe(4); // ceil(4001/4000)+ceil(4001/4000) = 2+2=4
    });

    it('종류가 확정된(packaging) 행은 suggestedPackaging이 생기지 않는다(기존 동작 유지)', () => {
      const [row] = calculateMaterialRequirements(
        1,
        [{ id: 1, material: matUnit(10, '오바사', 'CONE'), consumption: 301270, category: '실', colorCode: '', threadType: 'OBA_SA_SKU_I_SA' }],
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
      const threadBi = { id: 1, material: matSub(10, '코아사', 'OBA_SA_SKU_I_SA', { unit: 'EA' }), consumption: 74360, category: '실', colorCode: '', threadType: 'COA_SA' };
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
  // PR-220b: 아래 두 테스트는 원래(PR-220) "sheetQty가 없으면 스타일 전체 수량으로
  // 폴백해 1,518/3,036이 나온다(버그, 고치지 않음)"를 문서화했다. PR-220b는 그 폴백
  // 자체를 없애므로(색상 있는 행은 작지 수량도 수량표도 없으면 숫자를 만들지 않음) 더
  // 이상 1,518/3,036이 나오지 않는다 — 기대값을 "틀린 숫자가 안 보인다"로 바꿨다
  // (보고서 PR-220b 장의 "테스트 변경" 표 참고).
  describe('PR-220 0번 → PR-220b로 대체: sheetQty도 색상×사이즈 수량표도 없는 색상 행은 더 이상 틀린 숫자(1518/3036)를 만들지 않는다', () => {
    it('겉감이 색상별로 서로 다른 Item(사용자 실사례: "KHAKI KH" 등)이면, 수량표가 없으니 둘 다 needsColorQty(확인 필요)가 되고 1,518이 나오지 않는다', () => {
      const rows = calculateMaterialRequirements(
        1518, // 스타일 기획수량(target) — PR-220b 이전에는 이 값이 모든 색상 행에 그대로 곱해졌다(버그의 근원)
        [
          { id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
          { id: 2, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
        ],
        new Map(),
      );
      expect(rows.map((r) => [r.itemName, r.needsColorQty, r.basis])).toEqual([
        ['BLUE BL', true, 'unknown'],
        ['KHAKI KH', true, 'unknown'],
      ]);
      expect(rows.every((r) => r.requiredQty !== 1518)).toBe(true);
    });

    it('겉감이 같은 Item의 색상별 BOM 행(엑셀 업로드 모양)이어도 마찬가지로 3,036이 아니라 needsColorQty가 된다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: mat(22, '겉감'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
          { id: 2, material: mat(22, '겉감'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
        ],
        new Map(),
      );
      expect(row.requiredQty).not.toBe(3036);
      expect(row.needsColorQty).toBe(true);
      expect(row.basis).toBe('unknown');
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

    // PR-220b: 이 세 테스트는 "sheetQty 단위 유효성 게이트" 자체를 보는 것이라 색상과
    // 무관하게 만든다 — colorCode를 공통(''으로)으로 둬서, sheetQty가 거부된 뒤 바로
    // "색상 있는 행인데 수량표 없음(unknown)"으로 갈아타지 않고 원래 의도대로 computed
    // 폴백(공통 자재 기준)을 그대로 테스트한다.
    it('단위가 다르면(행 단위 Y, 작지 단위 M) 추측 환산하지 않고 기존 계산으로 폴백한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: '', sheetQty: 758, sheetQtyUnit: 'M' }],
        new Map(),
      );
      expect(row.requiredQty).toBe(1518); // 폴백 — sheetQty를 쓰지 않음
      expect(row.basis).toBe('computed');
    });

    it('단위가 불명(둘 중 하나라도 빈 값)이면 역시 폴백한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [{ id: 1, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: '', sheetQty: 758, sheetQtyUnit: null }],
        new Map(),
      );
      expect(row.requiredQty).toBe(1518);
      expect(row.basis).toBe('computed');
    });

    it('sheetQty가 0/음수/NaN이면(못 읽음 포함) 폴백한다', () => {
      for (const bad of [0, -1, NaN, null, undefined]) {
        const [row] = calculateMaterialRequirements(
          1518,
          [{ id: 1, material: matUnit(21, 'KHAKI KH', 'Y'), consumption: 1.0, category: '겉감', colorCode: '', sheetQty: bad as any, sheetQtyUnit: 'Y' }],
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

    // PR-220b: 두 번째 행(KH)은 sheetQty가 없고 색상이 있으므로, 이제는 "계산값(스타일
    // 전체×요척)"으로 폴백하지 않는다 — 색상×사이즈 수량표에 KH 합계가 있으면 그 값을
    // 쓴다(basis='mixed' = sheet + color-qty 조합). 원래 테스트가 의도한 "일부 행만
    // sheetQty"는 그대로 유지하되, 나머지 행의 근거를 수량표로 바꿨다(기대값도 그에 맞게
    // 760+1518→760+758로 변경 — 보고서 PR-220b 장 참고).
    it('재업로드 등에서 일부 행만 sheetQty가 있으면(mixed) basis는 "mixed"이고 requiredQty는 행별로 올바른 값을 합산한다', () => {
      const [row] = calculateMaterialRequirements(
        1518,
        [
          { id: 1, material: matUnit(21, '혼합자재', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'BL', sheetQty: 760, sheetQtyUnit: 'Y' },
          { id: 2, material: matUnit(21, '혼합자재', 'Y'), consumption: 1.0, category: '겉감', colorCode: 'KH' }, // sheetQty 없음 → 색상×사이즈 수량표(KH=758)로 계산
        ],
        new Map(),
        { colorQuantities: [{ color: 'KH', qty: 758 }] },
      );
      expect(row.basis).toBe('mixed');
      expect(row.needsColorQty).toBe(false);
      expect(row.requiredQty).toBe(760 + 758); // BL은 작지(760), KH는 수량표 기준(1×758)
    });
  });
});

// PR-220b: 색상별 자재는 "전체 수량 폴백" 금지 — sheetQty가 없으면 스타일 전체 수량이
// 아니라 색상×사이즈 수량표(PR-212, style_color_size_quantities)에서 그 색상의 합계를
// 찾아 쓰고, 그것도 없으면 숫자를 만들지 않는다(needsColorQty). 공통/FREE 행과 색상
// 없는 기존 데이터는 기존 계산(전체×요척) 그대로다(회귀 금지).
describe('PR-220b: 색상×사이즈 수량표(colorQuantities) 기반 필요량', () => {
  const matUnit = (id: number, name: string, unit?: string) => ({ id, code: `M${id}`, name, unit });

  // ② sheetQty 없음 + 수량표 BL=760, KH=758 → 760/758(요척 1.0)
  it('sheetQty 없음 + 수량표에 BL=760/KH=758이 있으면 그 값을 그대로 쓴다(요척 1.0)', () => {
    const rows = calculateMaterialRequirements(
      1518,
      [
        { id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
        { id: 2, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
      ],
      new Map(),
      { colorQuantities: [{ color: 'BL', qty: 760 }, { color: 'KH', qty: 758 }] },
    );
    expect(rows.map((r) => [r.itemName, r.requiredQty, r.basis, r.needsColorQty])).toEqual([
      ['BLUE BL', 760, 'color-qty', false],
      ['KHAKI KH', 758, 'color-qty', false],
    ]);
  });

  // 요척이 1.0이 아니면 "그 색상의 수량표 합계 × 요척"이어야 한다(그대로 대입이 아님).
  it('요척이 1이 아니면 수량표 합계 × 요척으로 계산한다', () => {
    const [row] = calculateMaterialRequirements(
      1518,
      [{ id: 1, material: mat(21, 'KHAKI KH'), consumption: 2.5, category: '겉감', colorCode: 'KH' }],
      new Map(),
      { colorQuantities: [{ color: 'KH', qty: 758 }] },
    );
    expect(row.requiredQty).toBe(758 * 2.5);
    expect(row.basis).toBe('color-qty');
  });

  // ③ 수량표에 BL만 있고 KH 없음 → KH는 unknown·needsColorQty
  it('수량표에 BL만 있고 KH가 없으면, BL은 color-qty로 계산되고 KH는 needsColorQty가 된다', () => {
    const rows = calculateMaterialRequirements(
      1518,
      [
        { id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
        { id: 2, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
      ],
      new Map(),
      { colorQuantities: [{ color: 'BL', qty: 760 }] }, // KH 없음
    );
    const bl = rows.find((r) => r.itemName === 'BLUE BL')!;
    const kh = rows.find((r) => r.itemName === 'KHAKI KH')!;
    expect(bl).toMatchObject({ requiredQty: 760, basis: 'color-qty', needsColorQty: false });
    expect(kh.needsColorQty).toBe(true);
    expect(kh.basis).toBe('unknown');
    expect(kh.requiredQty).toBe(0); // 합계에 0으로 "섞여 들어가지" 않도록 — 부분합이 아니라 0(= 알려진 기여가 없음)
    expect(kh.conversionWarning).toBe('색상별 수량 확인 필요 — 작지 재업로드(수량 포함) 또는 MATERIAL LIST 재업로드로 색상×사이즈 수량을 채워 주세요');
  });

  // ④ 공통 안감(FREE) → 전체×요척(기존 계산, 회귀 없음)
  it('colorCode가 "FREE"면 공통 행으로 보고 기존처럼 전체 수량×요척을 쓴다', () => {
    const [row] = calculateMaterialRequirements(
      1518,
      [{ id: 1, material: mat(30, '안감'), consumption: 1.2, category: '안감', colorCode: 'FREE' }],
      new Map(),
      { colorQuantities: [{ color: 'BL', qty: 760 }] }, // 수량표가 있어도 FREE 행은 영향받지 않는다
    );
    expect(row.requiredQty).toBe(1518 * 1.2);
    expect(row.basis).toBe('computed');
    expect(row.needsColorQty).toBe(false);
  });

  // colorCode가 'N/A'면 FREE와 동일하게 공통 행으로 본다 — mapping-commit.service.ts의
  // normalizeKeyPart()가 "색상 없음"을 빈 문자열이 아니라 리터럴 'N/A'로 저장하는 기존
  // 관례(엑셀 업로드 등 colorOf 칸이 비어 있는 운영 데이터 대다수가 이 값을 가진다) —
  // 이 값을 색상 있는 행으로 잘못 보면 기존 데이터 대량이 전부 needsColorQty가 된다.
  it('colorCode가 "N/A"면(기존 저장 관례상 "색상 없음") FREE와 똑같이 공통 행으로 본다', () => {
    const [row] = calculateMaterialRequirements(
      980,
      [{ id: 1, material: mat(40, '다데<실크>'), consumption: 2.9, category: '부자재', colorCode: 'N/A' }],
      new Map(),
    );
    expect(row.requiredQty).toBe(980 * 2.9);
    expect(row.basis).toBe('computed');
    expect(row.needsColorQty).toBe(false);
  });

  // ⑤ 색상 대소문자·공백 변형 — 정규화 규칙(앞뒤 공백 제거+대소문자 무시+내부 연속
  // 공백을 1칸으로)에 따라 어떤 변형이 매칭되고 안 되는지 표로 고정.
  describe('색상 비교 정규화 규칙(앞뒤 공백 제거 + 대소문자 무시 + 내부 연속 공백 1칸)', () => {
    const cases: { label: string; rowColor: string; tableColor: string; matches: boolean }[] = [
      { label: '대소문자만 다름', rowColor: 'bl', tableColor: 'BL', matches: true },
      { label: '앞뒤 공백만 다름', rowColor: '  BL  ', tableColor: 'BL', matches: true },
      { label: '내부 연속 공백이 여러 칸 → 1칸으로 정규화되어 일치', rowColor: 'DARK   BLUE', tableColor: 'DARK BLUE', matches: true },
      { label: '대소문자+공백 둘 다 다름', rowColor: ' dark blue ', tableColor: 'DARK BLUE', matches: true },
      { label: '내부 공백 자체가 없고 다른 글자(약어 vs 전체명)는 불일치', rowColor: 'BL', tableColor: 'BLUE', matches: false },
    ];
    it.each(cases)('$label (rowColor=$rowColor, tableColor=$tableColor, matches=$matches)', ({ rowColor, tableColor, matches }) => {
      const [row] = calculateMaterialRequirements(
        100,
        [{ id: 1, material: mat(40, '테스트자재'), consumption: 1.0, category: '겉감', colorCode: rowColor }],
        new Map(),
        { colorQuantities: [{ color: tableColor, qty: 100 }] },
      );
      if (matches) {
        expect(row.basis).toBe('color-qty');
        expect(row.needsColorQty).toBe(false);
        expect(row.requiredQty).toBe(100);
      } else {
        expect(row.basis).toBe('unknown');
        expect(row.needsColorQty).toBe(true);
      }
    });
  });

  // ⑥ BLUE vs BL → 약어↔전체명 추측 매칭 금지(불일치 → unknown)
  it('BLUE(수량표) vs BL(행)은 추측 매칭하지 않는다 — 불일치로 needsColorQty', () => {
    const [row] = calculateMaterialRequirements(
      100,
      [{ id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' }],
      new Map(),
      { colorQuantities: [{ color: 'BLUE', qty: 100 }] },
    );
    expect(row.basis).toBe('unknown');
    expect(row.needsColorQty).toBe(true);
  });

  // ⑦ 색상 없는 기존 데이터 회귀 — 수량표가 아예 없는 스타일의 색상 없는(또는 FREE)
  // 행은 PR-220b 이전과 100% 같은 결과를 낸다(이미 위 describe들의 대다수 테스트가
  // colorCode=''로 이를 증명하지만, 여기서 "수량표가 있어도 영향 없음"까지 명시한다).
  it('색상 없는(colorCode="") 행은 수량표가 있어도 없어도 기존 계산(전체×요척) 그대로다', () => {
    const withTable = calculateMaterialRequirements(
      1518,
      [{ id: 1, material: mat(50, '원단A'), consumption: 1.0, category: '겉감', colorCode: '' }],
      new Map(),
      { colorQuantities: [{ color: 'BL', qty: 760 }] },
    );
    const withoutTable = calculateMaterialRequirements(
      1518,
      [{ id: 1, material: mat(50, '원단A'), consumption: 1.0, category: '겉감', colorCode: '' }],
      new Map(),
    );
    expect(withTable[0].requiredQty).toBe(1518);
    expect(withoutTable[0].requiredQty).toBe(1518);
    expect(withTable[0].basis).toBe('computed');
    expect(withoutTable[0].basis).toBe('computed');
  });

  // ⑧ 테이프 색상별 행에서 올림 순서 불변 — 색상×사이즈 수량표 기준 입력으로도 기존
  // "행/색상 단위 올림 후 합산" 순서가 유지된다(포장 규칙 값·올림 순서 자체는 안 바뀜).
  it('포장 환산(콘/롤)은 수량표(color-qty) 기준 입력으로도 기존 색상별 올림 순서를 그대로 따른다', () => {
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const [row] = calculateMaterialRequirements(
      1,
      [
        { id: 1, material: matUnit(30, '오바사', 'M'), consumption: 1.0, category: '실', colorCode: 'BL', threadType: 'OBA_SA_SKU_I_SA' },
        { id: 2, material: matUnit(30, '오바사', 'M'), consumption: 1.0, category: '실', colorCode: 'KH', threadType: 'OBA_SA_SKU_I_SA' },
      ],
      new Map(),
      { packagingRules: [obaRule], colorQuantities: [{ color: 'BL', qty: 4001 }, { color: 'KH', qty: 4001 }] },
    );
    // 색상별 올림: ceil(4001/4000)=2, ceil(4001/4000)=2 → 합계 4 (전체 합산 올림이면 ceil(8002/4000)=3과 달라야 함)
    expect(row.packaging?.requiredPackages).toBe(4);
    expect(row.basis).toBe('color-qty');
    expect(row.needsColorQty).toBe(false);
  });

  it('needsColorQty 행은 포장 환산(packaging/suggestedPackaging)도 하지 않는다', () => {
    // 종류가 확정돼 있어도(threadType) 수량표 근거가 없는 색상 행이면 packaging을 만들지 않는다.
    const obaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const [row] = calculateMaterialRequirements(
      1,
      [{ id: 1, material: matUnit(30, '오바사', 'M'), consumption: 1.0, category: '실', colorCode: 'KH', threadType: 'OBA_SA_SKU_I_SA' }],
      new Map(),
      { packagingRules: [obaRule] }, // colorQuantities 없음
    );
    expect(row.needsColorQty).toBe(true);
    expect(row.packaging).toBeUndefined();
    expect(row.suggestedPackaging).toBeUndefined();
  });

  it('여러 BOM 행이 같은 colorQuantities를 재사용해도(스타일당 1회 조회를 흉내) 각 행이 올바르게 계산된다', () => {
    const rows = calculateMaterialRequirements(
      1518,
      [
        { id: 1, material: mat(20, 'BLUE BL'), consumption: 1.0, category: '겉감', colorCode: 'BL' },
        { id: 2, material: mat(21, 'KHAKI KH'), consumption: 1.0, category: '겉감', colorCode: 'KH' },
        { id: 3, material: mat(30, '안감'), consumption: 1.2, category: '안감', colorCode: '' },
      ],
      new Map(),
      { colorQuantities: [{ color: 'BL', qty: 760 }, { color: 'KH', qty: 758 }] },
    );
    expect(rows.map((r) => r.requiredQty)).toEqual([760, 758, 1518 * 1.2]);
  });
});
