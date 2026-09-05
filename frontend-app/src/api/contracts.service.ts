import apiClient from './client';

export interface Contract {
  id: number;
  styleNo: string;
  issuedAt: string;
  notes: string | null;
}

export const issueContract = (styleNo: string, notes?: string): Promise<any> =>
  apiClient.post('/contracts', { styleNo, notes });

export const getContractsByStyleNo = (styleNo: string): Promise<any> =>
  apiClient.get('/contracts', { params: { styleNo } });
