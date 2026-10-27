import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import apiClient from './client';
import { getMultiStyleRequirements } from './workOrders.service';
import { getCombinedPurchaseOrderDocuments } from './purchaseOrders.service';

const client = apiClient as unknown as Record<'get' | 'post' | 'patch' | 'delete', ReturnType<typeof vi.fn>>;

// PR-194: 다품번 일괄발주 1단계/3단계 API 경로 — 쉼표 구분 쿼리와 poIds 바디가 그대로 나가는지.
describe('getMultiStyleRequirements (PR-194)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('styleNos를 쉼표로 이어 GET /work-orders/multi-style-requirements 에 보낸다', async () => {
    client.get.mockResolvedValue([]);
    await getMultiStyleRequirements(['ST-A', 'ST-B', 'ST-C']);
    expect(client.get).toHaveBeenCalledWith('/work-orders/multi-style-requirements', { params: { styleNos: 'ST-A,ST-B,ST-C' } });
  });
});

describe('getCombinedPurchaseOrderDocuments (PR-194)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('poIds를 그대로 POST /purchase-orders/documents/combined 바디로 보낸다', async () => {
    client.post.mockResolvedValue([]);
    await getCombinedPurchaseOrderDocuments([1, 2, 3]);
    expect(client.post).toHaveBeenCalledWith('/purchase-orders/documents/combined', { poIds: [1, 2, 3] });
  });
});
