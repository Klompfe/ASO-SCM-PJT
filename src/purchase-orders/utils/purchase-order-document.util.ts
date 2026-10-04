import * as xlsx from 'xlsx';

// PR-178: 공급업체에 전달하는 발주서 표준 양식(엑셀). 생성 유틸만 두고 조회는 서비스가 한다.
// 발행 주체(상호)는 시스템 사이드바와 같은 회사명을 쓴다.
export const PURCHASE_ORDER_ISSUER_NAME = '태일무역';
export const PRICE_PENDING_NOTE = '추후 통보(선적서류 작성 시 확정)';

export interface PurchaseOrderDocumentLine {
  color?: string | null;
  size?: string | null;
  qty: number;
}

export interface PurchaseOrderDocumentContext {
  purchaseOrderId: number;
  orderDate: string | null;
  requiredDate: string | null;
  supplierName: string | null;
  supplierContact: string | null;
  supplierAddress: string | null;
  itemName: string | null;
  itemEnglishName: string | null;
  composition: string | null;
  hsCode: string | null;
  styleNo: string | null;
  factory: string | null;
  quantity: number;
  unitPrice: number | null;
  notes: string | null;
  // 색상/사이즈 라인이 있으면 라인별 내역을 표에 넣고, 없으면 총수량만 쓴다.
  lines: PurchaseOrderDocumentLine[];
}

export function buildPurchaseOrderDocumentSheetData(ctx: PurchaseOrderDocumentContext): (string | number)[][] {
  const priceCell: string | number = ctx.unitPrice != null ? ctx.unitPrice : PRICE_PENDING_NOTE;
  const amountCell: string | number = ctx.unitPrice != null ? ctx.unitPrice * ctx.quantity : PRICE_PENDING_NOTE;

  const rows: (string | number)[][] = [
    [`발 주 서 (PURCHASE ORDER)`],
    [],
    ['발주번호', `#${ctx.purchaseOrderId}`, '', '발행처', PURCHASE_ORDER_ISSUER_NAME],
    ['발주일자', ctx.orderDate ?? '', '', '납기일', ctx.requiredDate ?? ''],
    [],
    ['공급업체', ctx.supplierName ?? ''],
    ['연락처', ctx.supplierContact ?? ''],
    ['주소', ctx.supplierAddress ?? ''],
    [],
    ['스타일번호', ctx.styleNo ?? '', '', '생산처', ctx.factory ?? ''],
    ['자재명', ctx.itemName ?? ''],
    ['영문명', ctx.itemEnglishName ?? ''],
    ['혼용률', ctx.composition ?? ''],
    ['HS코드', ctx.hsCode ?? ''],
    [],
  ];

  if (ctx.lines.length > 0) {
    rows.push(['No.', '색상', '사이즈', '수량']);
    ctx.lines.forEach((l, i) => rows.push([i + 1, l.color ?? '', l.size ?? '', l.qty]));
    rows.push(['', '', '합계', ctx.quantity]);
  } else {
    rows.push(['수량', ctx.quantity]);
  }

  rows.push([]);
  rows.push(['단가', priceCell]);
  rows.push(['금액', amountCell]);
  rows.push(['비고', ctx.notes ?? '']);
  return rows;
}

export function buildPurchaseOrderDocumentBuffer(ctx: PurchaseOrderDocumentContext): Buffer {
  const data = buildPurchaseOrderDocumentSheetData(ctx);
  const sheet = xlsx.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, '발주서');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
