export interface StandardMaterialDto {
  itemName: string;
  itemCategory: string;
  spec: string;
  conAmount: number | string;
  vendor: string;
  unitPrice: number | string;
  status: 'VALID' | 'CONFIRM_REQUIRED' | 'MANUAL_REVIEW';
  remarks?: string;
}
