import { buildItemStyleUsage, attributePo, poBelongsToStyle } from './po-style-attribution.util';

const bom = (id: number, styleNo: string, materialIds: number[], isActive: boolean | undefined = true) => ({
  id, isActive, style: { styleNo }, items: materialIds.map((m) => ({ material: { id: m } })),
});

describe('buildItemStyleUsage (PR-196)', () => {
  it('자재를 쓰는 스타일이 1개면 그 스타일 하나만 담는다', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10])]);
    expect(usage.get(10)).toEqual(new Set(['A']));
  });

  it('같은 자재를 여러 스타일이 쓰면 전부 담는다(AMBIGUOUS 판단의 근거)', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10]), bom(2, 'B', [10])]);
    expect(usage.get(10)).toEqual(new Set(['A', 'B']));
  });

  it('같은 스타일에 BOM이 여러 개면 pickActiveBom(활성 BOM 중 최신)만 반영한다', () => {
    // 비활성(구버전) BOM이 자재 20을 썼지만, 활성 BOM은 자재 10만 쓴다 — 20은 담기지 않는다.
    const usage = buildItemStyleUsage([
      bom(1, 'A', [20], false),
      bom(2, 'A', [10], true),
    ]);
    expect(usage.get(10)).toEqual(new Set(['A']));
    expect(usage.has(20)).toBe(false);
  });

  it('스타일이 여러 개면 스타일마다 독립적으로 pickActiveBom을 적용한다', () => {
    const usage = buildItemStyleUsage([
      bom(1, 'A', [10], false),
      bom(2, 'A', [10], true),
      bom(3, 'B', [10, 20], true),
    ]);
    expect(usage.get(10)).toEqual(new Set(['A', 'B']));
    expect(usage.get(20)).toEqual(new Set(['B']));
  });
});

describe('attributePo (PR-196)', () => {
  it('styleNo가 있으면(연결 발주) LINKED — itemStyleUsage와 무관하게 그 값 그대로', () => {
    const usage = buildItemStyleUsage([bom(1, 'B', [10])]); // A는 아예 BOM이 없어도
    expect(attributePo({ itemId: 10, styleNo: 'A' }, usage)).toEqual({ kind: 'LINKED', styleNo: 'A' });
  });

  it('미연결 발주 + 자재를 쓰는 스타일이 1개면 AUTO로 그 스타일을 고른다', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10])]);
    expect(attributePo({ itemId: 10, styleNo: null }, usage)).toEqual({ kind: 'AUTO', styleNo: 'A' });
  });

  it('미연결 발주 + 자재를 쓰는 스타일이 2개 이상이면 AMBIGUOUS(누구 몫으로도 세지 않음)', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10]), bom(2, 'B', [10])]);
    const result = attributePo({ itemId: 10, styleNo: null }, usage);
    expect(result.kind).toBe('AMBIGUOUS');
    expect((result as any).candidates.sort()).toEqual(['A', 'B']);
  });

  it('미연결 발주 + 어떤 활성 BOM에도 안 쓰이는 자재면 ORPHAN', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10])]);
    expect(attributePo({ itemId: 999, styleNo: null }, usage)).toEqual({ kind: 'ORPHAN' });
  });

  it('styleNo가 undefined여도(명시적 null과 동일 취급) 미연결로 본다', () => {
    const usage = buildItemStyleUsage([bom(1, 'A', [10])]);
    expect(attributePo({ itemId: 10 }, usage)).toEqual({ kind: 'AUTO', styleNo: 'A' });
  });
});

describe('poBelongsToStyle (PR-196)', () => {
  const usage = buildItemStyleUsage([bom(1, 'A', [10]), bom(2, 'B', [10]), bom(3, 'C', [30])]);

  it('연결 발주는 연결된 스타일에서만 true', () => {
    expect(poBelongsToStyle({ itemId: 10, styleNo: 'A' }, 'A', usage)).toBe(true);
    expect(poBelongsToStyle({ itemId: 10, styleNo: 'A' }, 'B', usage)).toBe(false);
  });

  it('자동 귀속(AUTO)된 발주는 그 스타일에서만 true', () => {
    expect(poBelongsToStyle({ itemId: 30, styleNo: null }, 'C', usage)).toBe(true);
    expect(poBelongsToStyle({ itemId: 30, styleNo: null }, 'A', usage)).toBe(false);
  });

  it('모호(AMBIGUOUS)한 발주는 어느 스타일에서도 false(추측 금지)', () => {
    expect(poBelongsToStyle({ itemId: 10, styleNo: null }, 'A', usage)).toBe(false);
    expect(poBelongsToStyle({ itemId: 10, styleNo: null }, 'B', usage)).toBe(false);
  });

  it('고아(ORPHAN) 발주는 어느 스타일에서도 false', () => {
    expect(poBelongsToStyle({ itemId: 999, styleNo: null }, 'A', usage)).toBe(false);
  });
});
