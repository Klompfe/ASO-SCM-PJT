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
  // PR-244a/b: 단가 통화(KRW/USD). 기존 행은 NULL → KRW 로 본다(엔티티가 그대로 내려온다).
  currency?: string | null;
  remarks: string;
  composition?: string;
  hsCode?: string;
  threadType?: ThreadType | null;
  tapeType?: TapeType | null;
  // PR-220: 작지 인식 경로에서만 채워지는 원본 출고량·단위 — GET /boms(findActiveByStyleNo)가
  // select 없이 엔티티를 그대로 돌려줘 서버 응답에는 이미 들어 있었다(PR-227에서 타입만
  // 추가 — 백엔드 변경 없음). "소요수량"(requiredQty)이 왜 0인지 참고하는 데만 쓴다.
  sheetQty?: number | null;
  sheetQtyUnit?: string | null;
  // PR-231: 사람이 직접 지정한 이 행의 총 필요수량 — 있으면 계산값/작지 값보다 항상
  // 우선 적용된다. null이면 지정 안 함.
  manualRequiredQty?: number | null;
  manualRequiredQtyNote?: string | null;
  manualRequiredQtyAt?: string | null;
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
  // PR-231: 필요수량 직접 지정 — null을 보내면 수동 지정을 해제한다(계산값 사용).
  manualRequiredQty?: number | null;
  manualRequiredQtyNote?: string | null;
  // PR-241: 이 행만의 공급업체/단가 — 자재마스터·다른 스타일에는 영향 없다.
  // 빈 문자열/null은 "미정"으로 해제.
  supplier?: string | null;
  unitPrice?: number;
  // PR-244b: 통화만 바꾼다 — 단가 숫자는 서버도 자동 환산하지 않는다. 비우면 KRW.
  currency?: string;
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

// PR-241: "이 행만" 자재명 변경 — 서버가 기존 자재에 연결하거나 새 자재를 만든다.
export interface RenameBomItemMaterialResult {
  bomItem: BomItemRow;
  resultKind: 'linkedExisting' | 'createdNew';
  materialId: number;
  materialName: string;
}
export const renameBomItemMaterial = (id: number, name: string): Promise<RenameBomItemMaterialResult> =>
  apiClient.patch(`/boms/items/${id}/material-name`, { name });

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

// PR-256: 겉감 혼용률 점검 목록(읽기 전용) — 겉감 행이 없거나·겉감 혼용률이 비어 있거나·BOM 이 없는 스타일.
export type OuterFabricAuditStatus = 'noBom' | 'noRow' | 'blank';
export interface OuterFabricAuditItem {
  styleNo: string;
  styleName: string | null;
  status: OuterFabricAuditStatus;
  outerRowCount: number;
  blankOuterRows: number;
  totalRows: number;
  categories: string[];
}
export interface OuterFabricAuditResponse {
  items: OuterFabricAuditItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { noBom: number; noRow: number; blank: number; total: number };
  styleCount: number;
  // PR-262: 검색·필터와 무관한 전체 기준 수치와 서버가 적용한 조건. 배포 시차로 옛 서버 응답에는 없을 수 있다(그러면 화면은 의심 응답으로 본다).
  overall?: { total: number; noBom: number; noRow: number; blank: number; okCount: number };
  applied?: { q: string; status: 'all' | OuterFabricAuditStatus; page: number; pageSize: number };
  generatedAt?: string;
}
export interface OuterFabricAuditParams {
  status?: 'all' | OuterFabricAuditStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}
export const getOuterFabricAudit = (params: OuterFabricAuditParams = {}): Promise<OuterFabricAuditResponse> =>
  apiClient.get('/boms/outer-fabric-audit', { params });
