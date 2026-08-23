import apiClient from './client';

export interface Shipment {
  id: number;
  shipmentNumber: string;
  status: string;
  carrierName?: string;
  trackingNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateShipment {
  shipmentNumber: string;
  carrierName?: string;
  trackingNumber?: string;
}

export const getShipments = (): Promise<any> => apiClient.get('/shipments');
export const createShipment = (data: CreateShipment): Promise<any> => apiClient.post('/shipments', data);
