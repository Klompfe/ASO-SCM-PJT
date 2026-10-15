import apiClient from './client';

export interface BomItemMaterial {
  id: number;
  code: string;
  name: string;
  type: string;
  unit?: string;
}

export type ThreadType = 'COA_SA' | 'OBA_SA_SKU_I_SA' | 'POLY_JINUIDO';
// PR-175: 테이프류(다데/암홀) — threadType과 별도 컬럼(BomItem.tapeType).
export type TapeType = 'DADE' | 'AMHOL';

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
  threadType?: ThreadType | null;
  tapeType?: TapeType | null;
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
  threadType?: ThreadType;
  tapeType?: TapeType;
  // PR-197: 요척/규격/색상/구분도 인라인으로 고칠 수 있다 — 요척이 바뀌면 서버가
  // requiredQty(소요량 스냅샷)도 같이 재계산한다.
  consumption?: number;
  spec?: string;
  colorCode?: string;
  category?: string;
}

// PR-197: updateBomItem() 응답에 변경 전 값(before)이 함께 온다 — "요척 2.7 → 2.9" 같은
// 변경 전/후 확인 문구에 쓴다.
export interface UpdateBomItemResult extends BomItemRow {
  before: {
    composition?: string | null;
    hsCode?: string | null;
    threadType?: ThreadType | null;
    tapeType?: TapeType | null;
    consumption: number;
    spec: string;
    colorCode: string;
    category: string;
    requiredQty: number;
  };
}

export const getBomByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/boms', { params: { styleNo } });

export const updateBomItem = (id: number, data: UpdateBomItem): Promise<UpdateBomItemResult> =>
  apiClient.patch(`/boms/items/${id}`, data);

// PR-197: 저장된 BOM 행 삭제(자재 마스터/발주는 그대로 둠) — 같은 스타일에 연결된
// 발주(취소 제외) 건수를 함께 돌려줘 화면 확인창이 사람에게 알릴 수 있게 한다.
export interface DeleteBomItemResult {
  deletedId: number;
  linkedPurchaseOrderCount: number;
}
export const deleteBomItem = (id: number): Promise<DeleteBomItemResult> =>
  apiClient.delete(`/boms/items/${id}`);

// PR-197: 이 BOM 행이 가리키는 자재를 이미 등록된 다른 자재로 교체(이름 오인식 교정용).
export const swapBomItemMaterial = (id: number, materialId: number): Promise<BomItemRow> =>
  apiClient.patch(`/boms/items/${id}/material`, { materialId });

export interface AddLabelSetResult {
  bom: BomDetail;
  added: string[];
  skipped: string[];
}

// PR-099: "라벨류 기본 세트 추가" — 이미 있는 항목은 서버가 건너뛰고 없는 것만 추가한다.
// 본문이 필요 없는 요청이라 data 인자를 생략한다(axios에 null을 넘기면 클라이언트에서
// "null is not valid JSON" 에러가 나는 것을 실제로 확인했다).
export const addBomLabelSet = (styleNo: string): Promise<any> =>
  apiClient.post('/boms/label-set', undefined, { params: { styleNo } });

// PR-121: BOM 중복 검토 — BOM이 2건 이상인 스타일(확인 필요한 것 먼저)과, 스타일에서 사용할(활성) BOM 선택.
export const getDuplicateBoms = (): Promise<any> => apiClient.get('/boms/duplicates');
export const setActiveBom = (styleNo: string, bomId: number): Promise<any> =>
  apiClient.patch(`/boms/styles/${encodeURIComponent(styleNo)}/active-bom`, { bomId });
