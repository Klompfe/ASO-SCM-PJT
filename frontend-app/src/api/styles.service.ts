import apiClient from './client';

export interface StyleOverview {
  factory: string;
  buyer: string;
  totalQty: number;
  brand: string | null;
  itemType: string | null;
  productionType: 'FOB' | 'CMT' | null;
  targetRdd: string | null;
  cmtPrice: number | null;
  fobPrice: number | null;
  status: string;
}

export interface MasterStyle {
  styleNo: string;
  overview: StyleOverview | null;
}

export interface CreateMasterStyle {
  styleNo: string;
  factory: string;
  buyer: string;
  totalQty: number;
  brand: string;
  itemType: string;
  productionType: 'FOB' | 'CMT';
  targetRdd: string;
  cmtPrice?: number;
  fobPrice?: number;
}

export const getMasterStyles = (): Promise<any> => apiClient.get('/master-styles');
export const createMasterStyle = (data: CreateMasterStyle): Promise<any> => apiClient.post('/master-styles', data);
