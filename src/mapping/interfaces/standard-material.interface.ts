export interface StandardMaterial {
  code: string;
  itemName: string;
  orderQty?: number;
  colorOf?: string;
  colorUsed: string;
  spec: string;
  consumption: number;
  requiredQty: number;
  poDate: string;
  poQty: number;
  shipment1Date: string;
  shipment1RcvdQty: number;
  bln: number;
  shipment2Date: string;
  shipment2RcvdQty: number;
  supplier: string;
  unitPrice: number;
  remarks: string;
  status: string;
  dbType: string;

  // Added fields
  styleNo?: string;
  itemCategory?: string;
  quantity?: number;
}
