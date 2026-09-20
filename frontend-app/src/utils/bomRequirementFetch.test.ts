import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/workOrders.service', () => ({ getStyleRequirements: vi.fn(), getMaterialRequirements: vi.fn() }));

import { getMaterialRequirements, getStyleRequirements } from '../api/workOrders.service';
import { fetchStyleRequirementView, fetchWorkOrderRequirementView } from './bomRequirementFetch';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const emptyTotals = { materialCount: 0, shortageMaterialCount: 0 };
const styleRes = (over: object = {}) => ({ styleNo: 'ST-1', styleExists: true, quantity: 500, quantitySource: 'REQUESTED', styleTotalQty: 900, reason: null, bom: { id: 1, bomNo: 'B1', version: 'V1' }, bomCount: 1, rows: [], totals: emptyTotals, ...over });

describe('bomRequirementFetch — 소요명세서 조회 경로 (PR-129)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('스타일 선택 + 수량 입력: 그 styleNo/quantity로 getStyleRequirements를 호출하고 스타일 뷰로 돌려준다', async () => {
    mocked(getStyleRequirements).mockResolvedValue(styleRes());
    const v = await fetchStyleRequirementView('ST-1', 500);
    expect(getStyleRequirements).toHaveBeenCalledWith('ST-1', 500);
    expect(getMaterialRequirements).not.toHaveBeenCalled(); // 작업지시 경로는 타지 않는다
    expect(v).toMatchObject({ mode: 'STYLE', quantity: 500, subtitle: '스타일 ST-1 · 계획수량 500 · BOM #1 B1' });
  });

  it('수량을 비우면 quantity 없이(undefined) 호출한다 → 서버가 스타일 총 생산수량을 쓴다', async () => {
    mocked(getStyleRequirements).mockResolvedValue(styleRes({ quantity: 900, quantitySource: 'STYLE_TOTAL_QTY' }));
    const v = await fetchStyleRequirementView('ST-1', undefined);
    expect(getStyleRequirements).toHaveBeenCalledWith('ST-1', undefined);
    expect(v.quantity).toBe(900);
    expect(v.quantityNote).toContain('총 생산수량');
  });

  it('BOM 없는 스타일은 안내 문구가 붙은 뷰', async () => {
    mocked(getStyleRequirements).mockResolvedValue(styleRes({ reason: 'NO_BOM', bom: null }));
    expect((await fetchStyleRequirementView('ST-9')).notice).toBe('이 스타일은 아직 BOM이 등록되지 않았습니다.');
  });

  it('작업지시 보조 경로: 기존 getMaterialRequirements(작업지시ID)를 그대로 쓰고 작업지시 뷰로 돌려준다(회귀)', async () => {
    mocked(getMaterialRequirements).mockResolvedValue({
      workOrder: { id: 7, itemId: 1, itemName: 'FG', targetQuantity: 1000, status: 'PENDING' }, styleNo: 'BF1', reason: null,
      bom: { id: 51, bomNo: 'BOM-BF1-001', version: 'V1' }, bomCount: 1, rows: [], totals: emptyTotals,
    });
    const v = await fetchWorkOrderRequirementView(7);
    expect(getMaterialRequirements).toHaveBeenCalledWith(7);
    expect(getStyleRequirements).not.toHaveBeenCalled();
    expect(v).toMatchObject({ mode: 'WORK_ORDER', quantityLabel: '작업지시 물량', subtitle: '작업지시 #7 · 스타일 BF1 · 물량 1,000 · BOM #51 BOM-BF1-001' });
  });

  it('API 오류는 그대로 던져 화면이 토스트로 알린다', async () => {
    mocked(getStyleRequirements).mockRejectedValue(new Error('boom'));
    await expect(fetchStyleRequirementView('ST-1', 1)).rejects.toThrow('boom');
  });
});
