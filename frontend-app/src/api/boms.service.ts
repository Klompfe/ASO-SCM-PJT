import apiClient from './client';

export interface BomItemMaterial {
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
  material: BomItemMaterial;
}

export interface BomDetail {
  id: number;
  bomNo: string;
  version: string;
  items: BomItemRow[];
}

export const getBomByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/boms', { params: { styleNo } });
