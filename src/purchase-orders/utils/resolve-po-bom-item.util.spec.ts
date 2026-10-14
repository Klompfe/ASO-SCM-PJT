import { resolveBomItemForPurchaseOrder } from './resolve-po-bom-item.util';

const bom = (id: number, styleNo: string, materialIds: number[], isActive: boolean | undefined = true) => ({
  id, isActive, style: { styleNo, overview: null },
  items: materialIds.map((m) => ({ id: m * 100 + id, material: { id: m }, bom: undefined })),
});

describe('resolveBomItemForPurchaseOrder (PR-196)', () => {
  it('연결 발주(styleNo 있음) — 그 스타일의 활성 BOM에 자재가 있으면 FOUND', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([bom(1, 'A', [10])]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: 'A' });
    expect(result.kind).toBe('FOUND');
    if (result.kind === 'FOUND') {
      expect(result.bom.id).toBe(1);
      expect(result.bomItem.material?.id).toBe(10);
    }
  });

  it('연결 발주 — 같은 스타일에 BOM이 여러 개면 활성 BOM을 우선 쓴다(최신 id가 비활성이어도)', async () => {
    const bomRepository = {
      find: jest.fn().mockResolvedValue([bom(1, 'A', [10], true), bom(2, 'A', [10, 20], false)]),
    };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: 'A' });
    expect(result.kind).toBe('FOUND');
    if (result.kind === 'FOUND') expect(result.bom.id).toBe(1);
  });

  it('연결 발주 — 그 스타일의 BOM에 이 자재가 없으면 STYLE_MISMATCH', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([bom(1, 'A', [99])]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: 'A' });
    expect(result).toEqual({ kind: 'STYLE_MISMATCH', styleNo: 'A' });
  });

  it('연결 발주 — 그 스타일에 BOM 자체가 없으면 NO_BOM 취급 아니라 STYLE_MISMATCH(이 스타일에서 이 자재를 찾을 수 없음)', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: 'A' });
    expect(result).toEqual({ kind: 'STYLE_MISMATCH', styleNo: 'A' });
  });

  it('미연결 발주 + 자재를 쓰는 스타일이 1개뿐이면 그 스타일의 BOM 행을 쓴다(FOUND)', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([bom(1, 'A', [10])]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: null });
    expect(result.kind).toBe('FOUND');
    if (result.kind === 'FOUND') expect(result.bom.style.styleNo).toBe('A');
  });

  it('미연결 발주 + 자재를 2개 이상 스타일이 쓰면 AMBIGUOUS_UNLINKED(추측 금지)', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([bom(1, 'A', [10]), bom(2, 'B', [10])]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: null });
    expect(result).toEqual({ kind: 'AMBIGUOUS_UNLINKED' });
  });

  it('미연결 발주 + 어떤 활성 BOM에도 자재가 없으면 NO_BOM', async () => {
    const bomRepository = { find: jest.fn().mockResolvedValue([bom(1, 'A', [99])]) };
    const result = await resolveBomItemForPurchaseOrder(bomRepository as any, { itemId: 10, styleNo: null });
    expect(result).toEqual({ kind: 'NO_BOM' });
  });
});
