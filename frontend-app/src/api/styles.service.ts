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

// 주의(PR-038): GET /styles는 이 styles.service가 겨냥하는 StylesController(styles 테이블)가
// 아니라, 먼저 등록된 MasterModule의 StyleController(master_styles 테이블)가 항상 응답한다
// (같은 경로에 두 컨트롤러가 등록된 라우트 충돌 — app.module.ts 등록 순서상 Master가 우선).
// POST /styles는 충돌 없이 정상적으로 StylesController에 도달한다.
export const getStyles = (): Promise<any> => apiClient.get('/styles');
export const createStyle = (data: CreateStyle): Promise<any> => apiClient.post('/styles', data);
