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
  triggeredByWorkOrderSpecId: number | null;
}

export const issueContract = (styleNo: string, notes?: string): Promise<any> =>
  apiClient.post('/contracts', { styleNo, notes });

export const getContractsByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/contracts', { params: { styleNo } });

export const approveContract = (id: number): Promise<any> =>
  apiClient.patch(`/contracts/${id}/approve`);

export const rejectContract = (id: number): Promise<any> =>
  apiClient.patch(`/contracts/${id}/reject`);

export const deleteContract = (id: number): Promise<any> =>
  apiClient.delete(`/contracts/${id}`);
