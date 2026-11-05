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

// PR-141: 수정 — styleNo(PK, 다른 테이블이 참조)는 제외하고 나머지 개요 필드만 부분 수정.
export type UpdateMasterStyle = Partial<Omit<CreateMasterStyle, 'styleNo'>>;

export const getMasterStyles = (filter?: FindMasterStylesFilter): Promise<any> =>
  apiClient.get('/master-styles', { params: filter });
export const createMasterStyle = (data: CreateMasterStyle): Promise<any> => apiClient.post('/master-styles', data);
export const updateMasterStyle = (styleNo: string, data: UpdateMasterStyle): Promise<any> =>
  apiClient.patch(`/master-styles/${encodeURIComponent(styleNo)}`, data);

// PR-198: 작지 AI가 읽은 스타일번호와 "끝 글자만 다른" 기존 스타일을 찾는다(읽기 전용,
// 자동 변경 없음).
export const getSimilarMasterStyles = (styleNo: string): Promise<{ styleNo: string }[]> =>
  apiClient.get('/master-styles/similar', { params: { styleNo } });

// PR-222: 색상×사이즈 수량표(PR-212, styles.controller.ts GET :styleNo/quantities) —
// work-orders.service.ts(PR-220b)가 [A] 부족자재 표의 필요량 계산에 쓰는 것과 같은
// 조회다. 수주등록 저장 화면(자재명세 초안)이 "발주수량(적용)" 열을 같은 규칙으로
// 미리 보여주려고 읽기 전용으로 가져온다 — 저장/계산 로직은 바꾸지 않는다.
export interface StyleColorSizeQuantities {
  styleNo: string;
  sizes: string[];
  rows: { color: string; size: string; qty: number }[];
  totalByColor: { color: string; qty: number }[];
  grandTotal: number;
}
export const getStyleColorSizeQuantities = (styleNo: string): Promise<StyleColorSizeQuantities> =>
  apiClient.get(`/master-styles/${encodeURIComponent(styleNo)}/quantities`);
