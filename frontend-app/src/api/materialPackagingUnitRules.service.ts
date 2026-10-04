import apiClient from './client';

// PR-175: 실/테이프 등 자재 종류별 포장단위(콘/롤) 환산 기준 — thread-cone-price.util.ts
// 하드코딩 상수를 대체하는 DB 룩업 테이블. brandPrefixRules.service.ts와 동일한 패턴.
export interface MaterialPackagingUnitRule {
  id: number;
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  note?: string | null;
}

export interface CreateMaterialPackagingUnitRule {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  note?: string;
}

export type UpdateMaterialPackagingUnitRule = Partial<CreateMaterialPackagingUnitRule>;

export const getMaterialPackagingUnitRules = (): Promise<any> => apiClient.get('/material-packaging-unit-rules');
export const createMaterialPackagingUnitRule = (data: CreateMaterialPackagingUnitRule): Promise<any> =>
  apiClient.post('/material-packaging-unit-rules', data);
export const updateMaterialPackagingUnitRule = (id: number, data: UpdateMaterialPackagingUnitRule): Promise<any> =>
  apiClient.patch(`/material-packaging-unit-rules/${id}`, data);
export const deleteMaterialPackagingUnitRule = (id: number): Promise<any> =>
  apiClient.delete(`/material-packaging-unit-rules/${id}`);
