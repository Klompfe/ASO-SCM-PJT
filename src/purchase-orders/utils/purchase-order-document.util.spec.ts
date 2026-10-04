import * as xlsx from 'xlsx';
import { buildPurchaseOrderDocumentSheetData, buildPurchaseOrderDocumentBuffer, PRICE_PENDING_NOTE, PurchaseOrderDocumentContext } from './purchase-order-document.util';

const base: PurchaseOrderDocumentContext = {
  purchaseOrderId: 7, orderDate: '2026-10-04', requiredDate: '2026-12-15', supplierName: '공급사', supplierContact: '02-1', supplierAddress: '서울',
  itemName: '원단', itemEnglishName: 'FABRIC', composition: 'WOOL 100%', hsCode: '5111', styleNo: 'ST-1', factory: '베트남',
  quantity: 10, unitPrice: 2.5, notes: null, lines: [],
};

const find = (rows: any[][], label: string) => rows.find((r) => r[0] === label);

describe('purchase-order-document util (PR-178)', () => {
  it('단가가 있으면 단가와 금액(단가×수량)을 그대로 쓴다', () => {
    const rows = buildPurchaseOrderDocumentSheetData(base);
    expect(find(rows, '단가')?.[1]).toBe(2.5);
    expect(find(rows, '금액')?.[1]).toBe(25);
  });

  it('단가가 없으면(CMT 등) 추후 통보 안내 문구를 쓰고 금액도 같은 안내를 쓴다', () => {
    const rows = buildPurchaseOrderDocumentSheetData({ ...base, unitPrice: null });
    expect(find(rows, '단가')?.[1]).toBe(PRICE_PENDING_NOTE);
    expect(find(rows, '금액')?.[1]).toBe(PRICE_PENDING_NOTE);
  });

  it('라인이 없으면 총수량 한 줄만 쓰고, 라인이 있으면 라인별 표와 합계를 쓴다', () => {
    const plain = buildPurchaseOrderDocumentSheetData(base);
    expect(find(plain, '수량')?.[1]).toBe(10);
    expect(plain.some((r) => r[0] === 'No.')).toBe(false);

    const withLines = buildPurchaseOrderDocumentSheetData({
      ...base, lines: [{ color: 'BLACK', size: 'M', qty: 6 }, { color: 'WHITE', size: 'L', qty: 4 }],
    });
    expect(withLines.some((r) => r[0] === 'No.')).toBe(true);
    expect(withLines.find((r) => r[2] === '합계')?.[3]).toBe(10);
  });

  it('생성된 엑셀을 다시 읽으면 발주번호와 공급업체명이 그대로 들어 있다', () => {
    const buffer = buildPurchaseOrderDocumentBuffer(base);
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['발주서'], { header: 1, defval: '' });
    expect(find(rows, '발주번호')?.[1]).toBe('#7');
    expect(find(rows, '공급업체')?.[1]).toBe('공급사');
  });
});
