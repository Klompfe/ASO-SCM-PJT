import apiClient from './client';

export interface PurchaseOrder {
  id: number;
  itemId: number;
  item?: { id: number; code: string; name: string };
  quantity: number;
  unitPrice?: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  supplierId?: number;
  supplier?: { id: number; code: string; name: string };
  notes?: string;
  createdAt?: string;
  // PR-176: 색상/사이즈별 상세 줄(없으면 빈 배열 — 기존 발주).
  lines?: PurchaseOrderLine[];
  // PR-180: 실발주(FIRM)/가발주(PROVISIONAL). 기존 행은 null일 수 있다(미지정).
  orderType?: 'FIRM' | 'PROVISIONAL' | null;
  // PR-185: 스타일 연결(선택) — 있으면 "스타일 연결 트랙", 없으면 "스타일 미연결 트랙".
  styleNo?: string | null;
  // PR-185: 단가표(USD) 참고단가 — KRW unitPrice와 별개, 선택.
  referenceUnitPriceUsd?: number | null;
  referencePriceSource?: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL' | null;
  referencePriceNote?: string | null;
}

// PR-176: 색상/사이즈 자유입력 한 줄. 수량은 정수.
export interface PurchaseOrderLine {
  color?: string | null;
  size?: string | null;
  qty: number;
}

export interface CreatePurchaseOrder {
  supplierId: number;
  itemId: number;
  // PR-176: 라인이 있으면 생략 가능(총수량 = 라인 합계).
  quantity?: number;
  // PR-173: CMT 계약 건은 단가가 당장 필요 없어(수출선적서류 작성 시점에 입력) 선택값으로 바뀌었다.
  unitPrice?: number;
  lines?: PurchaseOrderLine[];
  notes?: string;
  orderType?: 'FIRM' | 'PROVISIONAL';
  // PR-185: 스타일 연결(선택). 있으면 서버가 스타일 존재/BOM 자재 포함 여부를 검증한다.
  styleNo?: string;
  referenceUnitPriceUsd?: number;
  referencePriceSource?: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL';
  referencePriceNote?: string;
}

// PR-173: 발주 생성 폼이 선택된 품목의 스타일 생산유형(CMT/FOB)을 미리 조회해 단가
// 필수 여부를 판단한다. BOM에 연결되지 않은 자재는 둘 다 null(FOB와 동일하게 취급).
export interface MaterialProductionContext {
  styleNo: string | null;
  productionType: 'CMT' | 'FOB' | null;
}

export const getMaterialProductionContext = (itemId: number): Promise<MaterialProductionContext> =>
  apiClient.get('/purchase-orders/material-context', { params: { itemId } });

export interface GetPurchaseOrdersFilter {
  supplierId?: number;
  itemId?: number;
  status?: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  startDate?: string;
  endDate?: string;
  // PR-127: 품목명/코드/공급업체명 부분일치 검색어
  keyword?: string;
  // PR-127: page 또는 limit를 주면 서버가 실제로 페이지네이션한다(둘 다 생략하면 전량 — 원장/리포트용)
  page?: number;
  limit?: number;
  // PR-185: 두 트랙 필터.
  track?: 'STYLE' | 'ITEM_ONLY';
  styleNo?: string;
}

export const getPurchaseOrders = (filter?: GetPurchaseOrdersFilter): Promise<any> =>
  apiClient.get('/purchase-orders', { params: filter });
export const createPurchaseOrder = (data: CreatePurchaseOrder): Promise<any> =>
  apiClient.post('/purchase-orders', data);
export const updatePurchaseOrderStatus = (
  id: number,
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED',
): Promise<any> => apiClient.patch(`/purchase-orders/${id}/status`, { status });

// PR-177: 미입고(PENDING) 발주 수정 — 수량/단가/비고.
// MERGE-3: lines를 보내면 기존 줄을 전부 교체하고 quantity를 줄 합계로 다시 계산한다(서버).
export const updatePurchaseOrder = (
  id: number,
  data: {
    quantity?: number; unitPrice?: number; notes?: string; lines?: PurchaseOrderLine[];
    // PR-185: null이면 스타일 연결 해제, 값이면 재검증 후 연결/변경.
    styleNo?: string | null;
    referenceUnitPriceUsd?: number;
    referencePriceSource?: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL';
    referencePriceNote?: string;
  },
): Promise<any> => apiClient.patch(`/purchase-orders/${id}`, data);

// PR-179: 일괄발주 — 미리보기에서 확인된 행들을 한 번에 생성(서버는 하나라도 틀리면 전부 취소).
// MERGE-2: CMT(가발주) 건은 단가가 선택 입력이라 unitPrice를 생략할 수 있다(PR-173 정책).
export const createPurchaseOrdersBulk = (
  orders: { supplierId: number; itemId: number; quantity: number; unitPrice?: number; notes?: string; orderType?: 'FIRM' | 'PROVISIONAL'; styleNo?: string }[],
): Promise<any> => apiClient.post('/purchase-orders/bulk', { orders });

// PR-178: 발주서 표준 양식(엑셀) — base64로 내려온다(Bearer 인증 때문에 직접 링크 불가).
export const getPurchaseOrderDocument = (id: number): Promise<{ filename: string; base64: string }> =>
  apiClient.get(`/purchase-orders/${id}/document`);

// PR-180: 품목의 발주 구분 제안 — 이 품목을 쓰는 활성 BOM 스타일의 계약방식 기준. 확신할 수 없으면 orderType이 null이다.
export interface OrderTypeSuggestion {
  orderType: 'FIRM' | 'PROVISIONAL' | null;
  reason: string;
  styleNos: string[];
}
export const getOrderTypeSuggestion = (itemId: number): Promise<OrderTypeSuggestion> =>
  apiClient.get('/purchase-orders/order-type-suggestion', { params: { itemId } });

// PR-185: 단가표(USD) 참고단가 — 브랜드 전용가 → 미도 단가표 순 후보. 서버가 자동으로
// 하나를 저장하지 않는다(안전모드) — 화면에서 사람이 고르거나 직접 입력한다.
export interface PriceReferenceConversionOption {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  unitPriceUsd: number;
  formula: string;
  unitPriceUsdMax?: number;
  formulaMax?: string;
}
export interface PriceReferenceConversion {
  determined: boolean;
  options: PriceReferenceConversionOption[];
  warning?: string;
}
export interface PriceReferenceCandidate {
  source: 'BRAND_RULE' | 'MIDO_TABLE';
  label: string;
  priceUsd: number;
  priceUsdMax?: number;
  unit: string;
  note?: string | null;
  conversion?: PriceReferenceConversion;
  brandRuleId?: number;
  midoPriceItemId?: number;
  // PR-187: 미터단가가 콘/롤단가로 환산됐으면(종류가 확정되고 규칙이 1개로 정해질 때) 그
  // 근거 식이 담긴다 — 있으면 이 후보의 priceUsd/unit은 이미 콘/롤 기준으로 바뀐 값이다.
  conversionFormula?: string;
  convertedFrom?: { priceUsd: number; unit: string; unitLengthM: number };
}
export interface PriceReferenceResult {
  candidates: PriceReferenceCandidate[];
  suggested: PriceReferenceCandidate | null;
  unitMismatchWarning?: string;
  // PR-187: 종류 미지정인데 이름이 실/테이프로 보이는 자재 — 미터단가를 그대로 쓰도록
  // 유도하지 않기 위한 경고(이때는 unitMismatchWarning을 함께 받지 않는다).
  warning?: string;
  brand: string | null;
  krw?: { rate: number; validFrom: string; validTo: string; rateType: 'EXPORT'; approxUnitPriceKrw: number };
  // PR-187: 환산이 적용됐을 때 콘/롤 단위 라벨 — "USD/콘" 같은 단위 표시에 쓴다.
  packagingUnitLabel?: string;
}
export const getPriceReference = (params: { itemId: number; styleNo?: string; brandName?: string; lineUnit?: string; materialSubType?: string }): Promise<PriceReferenceResult> =>
  apiClient.get('/purchase-orders/price-reference', { params });
