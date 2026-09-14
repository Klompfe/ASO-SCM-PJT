import apiClient from './client';

export interface HsCodeClassification {
  id: number;
  itemType: string;
  fabricType: string;
  composition: string;
  hsCode: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  // PR-084: 목록 조회 시 이 조합에 연결된 스타일번호 목록(여러 개일 수 있음).
  styleNos?: string[];
}

export interface HsCodeClassificationsPage {
  items: HsCodeClassification[];
  total: number;
  page: number;
  limit: number;
}

export interface HsCodeImportConflict {
  itemType: string;
  fabricType: string;
  composition: string;
  previousHsCode: string;
  newHsCode: string;
}

export interface HsCodeImportResult {
  totalRows: number;
  created: number;
  updated: number;
  conflicts: HsCodeImportConflict[];
}

export interface CreateHsCodeClassification {
  itemType: string;
  fabricType: string;
  composition: string;
  hsCode: string;
  note?: string;
  // PR-084: 지정하면 이 조합에 스타일번호도 함께 연결(upsert)한다.
  styleNo?: string;
}

export interface GetHsCodeClassificationsFilter {
  itemType?: string;
  fabricType?: string;
  composition?: string;
  styleNo?: string;
  page?: number;
  limit?: number;
}

export const getHsCodeClassifications = (
  filter?: GetHsCodeClassificationsFilter,
): Promise<any> => apiClient.get('/hs-code-classifications', { params: filter });

export const createHsCodeClassification = (data: CreateHsCodeClassification): Promise<any> =>
  apiClient.post('/hs-code-classifications', data);

export const uploadHsCodeClassifications = (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/hs-code-classifications/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// PR-084: 스타일번호로 기존 등록값을 불러온다(관세사 확인 후 화면에서 바로 고칠 수
// 있게 하는 용도) — 없으면 404(apiClient 인터셉터가 에러로 던짐, 호출 측에서 catch).
export const getHsCodeClassificationByStyle = (styleNo: string): Promise<any> =>
  apiClient.get(`/hs-code-classifications/style/${encodeURIComponent(styleNo)}`);
