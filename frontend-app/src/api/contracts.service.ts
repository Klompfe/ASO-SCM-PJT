import apiClient from './client';

export type ContractStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
export type ProductionType = 'FOB' | 'CMT';
export type SalesMarket = 'DOMESTIC' | 'CHINA';
// PR-181: HANDWRITTEN_DRAFT(미도 수기 초안, 승인 시 확정 필요) / MANUAL_CONFIRMED(승인자가 확정) 추가.
export type CmtPriceConfidence = 'EXACT_STYLE_MATCH' | 'BRAND_CATEGORY_AVERAGE' | 'NEEDS_REVIEW' | 'HANDWRITTEN_DRAFT' | 'MANUAL_CONFIRMED';

export interface Contract {
  id: number;
  styleNo: string;
  issuedAt: string;
  notes: string | null;
  status: ContractStatus;
  totalQty: number | null;
  targetRdd: string | null;
  factory: string | null;
  buyer: string | null;
  productionType: ProductionType | null;
  salesMarket: SalesMarket | null;
  cmtPrice: number | null;
  fobPrice: number | null;
  cmtPriceConfidence: CmtPriceConfidence | null;
  cmtPriceNote: string | null;
  approvedByUserId: number | null;
  approvedAt: string | null;
  triggeredBySalesOrderSpecId: number | null; // PR-133: triggeredByWorkOrderSpecId에서 이름 변경
}

// PR-167: 승인 화면이 "판매시장 선택이 필요한지/제안 계약방식이 뭔지"를 미리
// 보여주기 위해 조회하는 컨텍스트 — 빈폴/에잇세컨즈는 requiresSalesMarket=true로
// 오고, 그 외 브랜드는 Buyer.defaultProductionType이 suggestedProductionType으로 온다.
export interface ContractApprovalContext {
  contractId: number;
  styleNo: string;
  brand: string | null;
  requiresSalesMarket: boolean;
  currentSalesMarket: SalesMarket | null;
  suggestedProductionType: ProductionType | null;
  buyerDefaultProductionType: ProductionType | null;
}

export const issueContract = (styleNo: string, notes?: string): Promise<any> =>
  apiClient.post('/contracts', { styleNo, notes });

export const getContractsByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/contracts', { params: { styleNo } });

export const getContractApprovalContext = (id: number): Promise<ContractApprovalContext> =>
  apiClient.get(`/contracts/${id}/approval-context`);

// PR-167: 빈폴/에잇세컨즈는 salesMarket 없이 호출하면 서버가 400으로 거부한다
// (안전모드 — 자동 추론 금지). 그 외 브랜드는 생략 가능(기존 동작 유지).
// PR-181: 계약이 HANDWRITTEN_DRAFT면 cmtPrice를 반드시 보내야 서버가 승인한다.
export const approveContract = (id: number, overrides?: { salesMarket?: SalesMarket; productionType?: ProductionType; cmtPrice?: number; cmtPriceNote?: string }): Promise<any> =>
  apiClient.patch(`/contracts/${id}/approve`, overrides ?? {});

export interface BulkApproveResult {
  approvedCount: number;
  failed: { id: number; reason: string }[];
}

// PR-090: ids를 생략하면 현재 PENDING_APPROVAL 전체를 대상으로 한다.
// PR-167: ids를 생략했을 때만 factory가 의미 있다 — 그 생산처 건만 일괄승인 대상.
export const bulkApproveContracts = (ids?: number[], factory?: string): Promise<BulkApproveResult> =>
  apiClient.patch('/contracts/bulk-approve', { ...(ids ? { ids } : {}), ...(factory ? { factory } : {}) });

export const rejectContract = (id: number): Promise<any> =>
  apiClient.patch(`/contracts/${id}/reject`);

export const deleteContract = (id: number): Promise<any> =>
  apiClient.delete(`/contracts/${id}`);
