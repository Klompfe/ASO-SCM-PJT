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
