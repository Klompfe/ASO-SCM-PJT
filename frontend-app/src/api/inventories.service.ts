import apiClient from './client';

export interface Inventory {
  id: number;
  itemId: number;
  quantity: number;
  item?: { id: number; code: string; name: string; type: string; unit?: string } | null;
  createdAt: string;
  updatedAt: string;
}

// PR-110: 재고현황 보고서용 — GET /inventories는 PR-018 즈음부터 이미 있었으나
// 프론트 화면이 아예 없었다(입고/출고 처리 API만 쓰였음). 조회 전용으로 재사용한다.
export const getInventories = (): Promise<any> => apiClient.get('/inventories');
