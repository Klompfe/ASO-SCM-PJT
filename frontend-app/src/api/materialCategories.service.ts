import apiClient from './client';

// PR-183: 품목군(겉감·안감·심지·실·테이프 …) 마스터. 공급업체는 여러 품목군을 취급할 수 있고,
// 품목은 선택적으로 한 품목군에 속한다.
export interface MaterialCategory {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateMaterialCategory {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateMaterialCategory = Partial<CreateMaterialCategory>;

// 목록은 서버가 활성 우선 → sortOrder 순으로 준다(화면이 다시 정렬하지 않아도 같은 순서).
export const getMaterialCategories = (): Promise<any> => apiClient.get('/material-categories');
export const createMaterialCategory = (data: CreateMaterialCategory): Promise<any> =>
  apiClient.post('/material-categories', data);
export const updateMaterialCategory = (id: number, data: UpdateMaterialCategory): Promise<any> =>
  apiClient.patch(`/material-categories/${id}`, data);
// 사용 중인 품목군은 400으로 거절된다(비활성으로 바꾸라는 메시지가 응답에 실린다).
export const deleteMaterialCategory = (id: number): Promise<any> => apiClient.delete(`/material-categories/${id}`);
