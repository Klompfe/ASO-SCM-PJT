import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import apiClient from './client';
import * as sales from './salesOrders.service';
import * as work from './workOrders.service';

const client = apiClient as unknown as Record<'get' | 'post' | 'patch' | 'delete', ReturnType<typeof vi.fn>>;

// PR-134: 수주(작업지시서 업로드) API는 salesOrders.service.ts로 옮겼고 /sales-orders/* 경로만 쓴다. workOrders.service.ts에는 남지 않는다.
describe('salesOrders.service — 수주 등록 API 경로 (PR-134)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploadSalesOrderImage: 파일을 multipart로 POST /sales-orders/upload-image 에 보낸다', async () => {
    client.post.mockResolvedValue({ results: [], chargedAmountKrw: 0, isMock: false });
    const file = new File(['x'], 'sheet.png', { type: 'image/png' });
    await sales.uploadSalesOrderImage(file);
    const [url, body, config] = client.post.mock.calls[0];
    expect(url).toBe('/sales-orders/upload-image');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  // PR-192: 백엔드가 240초 한도로 재시도·폴백을 끝내므로, 중간 프록시가 그보다 먼저
  // 끊어버리지 않도록 그보다 긴 타임아웃을 명시한다(이 요청에만 — 전역 기본값은 그대로).
  it('uploadSalesOrderImage: axios timeout을 270초로 지정한다(전역 기본값과 별개)', async () => {
    client.post.mockResolvedValue({ results: [], chargedAmountKrw: 0, isMock: false });
    const file = new File(['x'], 'sheet.png', { type: 'image/png' });
    await sales.uploadSalesOrderImage(file);
    const [, , config] = client.post.mock.calls[0];
    expect(config.timeout).toBe(270_000);
  });

  it('commitSalesOrderAnalysis: 분석 결과 그대로 POST /sales-orders/commit-analysis', async () => {
    client.post.mockResolvedValue({ id: 1 });
    const result = { overview: { styleNo: 'S1' }, bomItems: [], sizeSpecs: [], workNotes: null } as any;
    await sales.commitSalesOrderAnalysis(result);
    expect(client.post).toHaveBeenCalledWith('/sales-orders/commit-analysis', result);
  });

  it('getSalesOrderSpec / getAiUsage / getAiUsageSummary 경로', async () => {
    client.get.mockResolvedValue([]);
    await sales.getSalesOrderSpec('MB62SLM103Z');
    await sales.getAiUsage();
    await sales.getAiUsageSummary();
    expect(client.get).toHaveBeenNthCalledWith(1, '/sales-orders/spec', { params: { styleNo: 'MB62SLM103Z' } });
    expect(client.get).toHaveBeenNthCalledWith(2, '/sales-orders/ai-usage');
    expect(client.get).toHaveBeenNthCalledWith(3, '/sales-orders/ai-usage/summary');
  });
});

describe('workOrders.service — 작업지시(생산 실행) API만 남는다 (PR-134)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('수주 등록용 함수들은 더 이상 이 파일에 없다', () => {
    const names = Object.keys(work);
    for (const gone of ['uploadWorkOrderImage', 'commitWorkOrderAnalysis', 'getWorkOrderSpec', 'getAiUsage', 'getAiUsageSummary']) {
      expect(names).not.toContain(gone);
    }
  });

  it('남은 함수는 전부 /work-orders 경로만 쓴다(/sales-orders 없음) — 회귀 없음', async () => {
    client.get.mockResolvedValue({});
    client.post.mockResolvedValue({});
    client.patch.mockResolvedValue({});
    await work.getWorkOrders({ page: 1, limit: 10 });
    await work.createWorkOrder({ itemId: 1, targetQuantity: 5 });
    await work.updateWorkOrderStatus(3, { status: 'COMPLETED' });
    await work.getMaterialRequirements(3);
    await work.getStyleRequirements('S1', 100);
    const urls = [...client.get.mock.calls, ...client.post.mock.calls, ...client.patch.mock.calls].map((c) => c[0] as string);
    expect(urls).toEqual(['/work-orders', '/work-orders/3/material-requirements', '/work-orders/style-requirements', '/work-orders', '/work-orders/3/status']);
    expect(urls.some((u) => u.includes('sales-orders'))).toBe(false);
  });
});
