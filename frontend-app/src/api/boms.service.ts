import apiClient from './client';

export interface BomItemMaterial {
  id: number;
  code: string;
  name: string;
  type: string;
  unit?: string;
}

export interface BomItemRow {
  id: number;
  category: string;
  colorCode: string;
  spec: string;
  consumption: number;
  requiredQty: number;
  supplier: string;
  unitPrice: number;
  remarks: string;
  composition?: string;
  hsCode?: string;
  material: BomItemMaterial;
}

export interface BomDetail {
  id: number;
  bomNo: string;
  version: string;
  items: BomItemRow[];
}

export interface UpdateBomItem {
  composition?: string;
  hsCode?: string;
}

export const getBomByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/boms', { params: { styleNo } });

export const updateBomItem = (id: number, data: UpdateBomItem): Promise<any> =>
  apiClient.patch(`/boms/items/${id}`, data);

export interface AddLabelSetResult {
  bom: BomDetail;
  added: string[];
  skipped: string[];
}

// PR-099: "라벨류 기본 세트 추가" — 이미 있는 항목은 서버가 건너뛰고 없는 것만 추가한다.
// 본문이 필요 없는 요청이라 data 인자를 생략한다(axios에 null을 넘기면 클라이언트에서
// "null is not valid JSON" 에러가 나는 것을 실제로 확인했다).
export const addBomLabelSet = (styleNo: string): Promise<any> =>
  apiClient.post('/boms/label-set', undefined, { params: { styleNo } });
