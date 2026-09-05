import apiClient from './client';

export interface Style {
  styleNo: string;
  brand: string;
  itemType: string;
  productionType: 'FOB' | 'CMT';
  targetRdd: string;
  totalQty: number;
  status: string;
  cmtPrice?: number;
  fobPrice?: number;
}

export interface CreateStyle {
  styleNo: string;
  brand: string;
  itemType: string;
  productionType: 'FOB' | 'CMT';
  targetRdd: string;
  totalQty: number;
  cmtPrice?: number;
  fobPrice?: number;
}

export const getStyles = (): Promise<any> => apiClient.get('/styles');
export const createStyle = (data: CreateStyle): Promise<any> => apiClient.post('/styles', data);
