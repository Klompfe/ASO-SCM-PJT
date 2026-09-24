import apiClient from './client';

export type ContractStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

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
  productionType: 'FOB' | 'CMT' | null;
  cmtPrice: number | null;
  fobPrice: number | null;
  approvedByUserId: number | null;
  approvedAt: string | null;
  triggeredBySalesOrderSpecId: number | null; // PR-133: triggeredByWorkOrderSpecId에서 이름 변경
}

export const issueContract = (styleNo: string, notes?: string): Promise<any> =>
  apiClient.post('/contracts', { styleNo, notes });

export const getContractsByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/contracts', { params: { styleNo } });

export const approveContract = (id: number): Promise<any> =>
  apiClient.patch(`/contracts/${id}/approve`);

export interface BulkApproveResult {
  approvedCount: number;
  failed: { id: number; reason: string }[];
}

// PR-090: ids를 생략하면 현재 PENDING_APPROVAL 전체를 대상으로 한다.
export const bulkApproveContracts = (ids?: number[]): Promise<BulkApproveResult> =>
  apiClient.patch('/contracts/bulk-approve', ids ? { ids } : {});

export const rejectContract = (id: number): Promise<any> =>
  apiClient.patch(`/contracts/${id}/reject`);

export const deleteContract = (id: number): Promise<any> =>
  apiClient.delete(`/contracts/${id}`);
