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
  styleName: string | null;
}

export interface MasterStyle {
  styleNo: string;
  overview: StyleOverview | null;
  // PR-111: 스타일번호 접두사로 조회 시점에 계산되는 값(DB 컬럼 아님) — 기존
  // overview.brand(자유입력, 미사용 레거시 필드)와는 다른 값이다.
  brand?: string | null;
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

export interface FindMasterStylesFilter {
  styleNo?: string;
  targetRddFrom?: string;
  targetRddTo?: string;
  // PR-101: 카테고리성 값(예: JK/BL/OP/SL)이라 정확히 일치로 필터링된다.
  itemType?: string;
  // PR-111: 브랜드(스타일번호 접두사로 분류) 정확히 일치 필터.
  brand?: string;
}

export const getMasterStyles = (filter?: FindMasterStylesFilter): Promise<any> =>
  apiClient.get('/master-styles', { params: filter });
export const createMasterStyle = (data: CreateMasterStyle): Promise<any> => apiClient.post('/master-styles', data);
