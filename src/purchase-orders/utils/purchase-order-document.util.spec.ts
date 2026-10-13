import * as xlsx from 'xlsx';
import {
  buildPurchaseOrderDocumentSheetData,
  buildPurchaseOrderDocumentBuffer,
  buildCombinedPurchaseOrderDocumentSheetData,
  buildCombinedPurchaseOrderDocumentBuffer,
  PRICE_PENDING_NOTE,
  PurchaseOrderDocumentContext,
  CombinedPurchaseOrderDocumentContext,
} from './purchase-order-document.util';

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

// PR-194: 다품번 일괄발주 — 업체별 합본 발주서(스타일별 행 + 품목 소계 + 업체 전체 합계).
describe('buildCombinedPurchaseOrderDocumentSheetData (PR-194)', () => {
  const combinedBase: CombinedPurchaseOrderDocumentContext = {
    orderDate: '2026-10-14',
    supplierName: '합본 공급사',
    supplierContact: '02-2',
    supplierAddress: '인천',
    lines: [
      { purchaseOrderId: 1, categoryGroup: '원단', materialSubTypeLabel: null, itemCode: 'FAB-1', itemName: '폴리원단', unit: 'YD', styleNo: 'ST-A', quantity: 100, unitPrice: 2, requiredDate: '2026-11-01', notes: null },
      { purchaseOrderId: 2, categoryGroup: '원단', materialSubTypeLabel: null, itemCode: 'FAB-1', itemName: '폴리원단', unit: 'YD', styleNo: 'ST-B', quantity: 50, unitPrice: 2, requiredDate: '2026-11-05', notes: null },
      { purchaseOrderId: 3, categoryGroup: '부자재', materialSubTypeLabel: '코아사', itemCode: 'THR-1', itemName: '재봉사', unit: '콘', styleNo: 'ST-A', quantity: 3, unitPrice: null, requiredDate: null, notes: '긴급' },
    ],
  };

  it('헤더(발행처/공급업체)와 표 헤더 행을 쓴다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    expect(rows.some((r) => r[0] === '공급업체' && r[1] === '합본 공급사')).toBe(true);
    expect(rows.some((r) => r.includes('품목군') && r.includes('스타일번호'))).toBe(true);
  });

  it('같은 품목이 스타일별로 행이 나뉘고, 단가가 모든 행에서 같으면 그대로 적는다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    const styleARow = rows.find((r) => r[3] === 'ST-A' && String(r[1]).includes('폴리원단'));
    const styleBRow = rows.find((r) => r[3] === 'ST-B' && String(r[1]).includes('폴리원단'));
    expect(styleARow?.[4]).toBe(100);
    expect(styleARow?.[5]).toBe(2);
    expect(styleARow?.[6]).toBe(200);
    expect(styleBRow?.[4]).toBe(50);
  });

  it('품목 소계 행에 스타일별 수량의 합과(단가가 같으므로) 합계 금액을 적는다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    const subtotal = rows.find((r) => r[1] === '폴리원단 소계');
    expect(subtotal?.[4]).toBe(150); // 100 + 50
    expect(subtotal?.[5]).toBe(2);
    expect(subtotal?.[6]).toBe(300); // 2 * 150
  });

  it('단가가 비어 있으면 그 행/소계 모두 추후통보 문구를 쓴다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    const threadRow = rows.find((r) => String(r[1]).includes('재봉사') && !String(r[1]).includes('소계'));
    const threadSubtotal = rows.find((r) => r[1] === '재봉사 소계');
    expect(threadRow?.[5]).toBe(PRICE_PENDING_NOTE);
    expect(threadSubtotal?.[5]).toBe(PRICE_PENDING_NOTE);
  });

  it('실/테이프 종류 라벨이 있으면 품목명 옆에 괄호로 붙인다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    expect(rows.some((r) => String(r[1]).includes('재봉사(코아사)'))).toBe(true);
  });

  it('스타일 납기가 없으면 빈칸이다(추정 금지)', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    const threadRow = rows.find((r) => String(r[1]).includes('재봉사') && !String(r[1]).includes('소계'));
    expect(threadRow?.[7]).toBe('');
  });

  it('업체 전체 합계 행에 전체 수량 합과(품목별 단가가 전부 확정일 때만) 금액 합을 적는다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(combinedBase);
    const grand = rows.find((r) => r[1] === '업체 전체 합계');
    expect(grand?.[4]).toBe(153); // 100 + 50 + 3
    // 재봉사 단가가 비어 있어 전체 합계 금액도 확정할 수 없다 — 추후통보.
    expect(grand?.[6]).toBe(PRICE_PENDING_NOTE);
  });

  it('모든 품목의 단가가 확정이면 업체 전체 합계 금액도 숫자로 합산된다', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData({
      ...combinedBase,
      lines: combinedBase.lines.filter((l) => l.itemCode === 'FAB-1'),
    });
    const grand = rows.find((r) => r[1] === '업체 전체 합계');
    expect(grand?.[4]).toBe(150);
    expect(grand?.[6]).toBe(300);
  });

  it('생성된 엑셀을 다시 읽으면 공급업체명이 그대로 들어 있다', () => {
    const buffer = buildCombinedPurchaseOrderDocumentBuffer(combinedBase);
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['합본발주서'], { header: 1, defval: '' });
    expect(rows.some((r) => r[0] === '공급업체' && r[1] === '합본 공급사')).toBe(true);
  });
});
