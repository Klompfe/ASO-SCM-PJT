import * as xlsx from 'xlsx';
import {
  buildPurchaseOrderDocumentSheetData,
  buildCombinedPurchaseOrderDocumentSheetData,
  PRICE_PENDING_NOTE,
  PurchaseOrderDocumentContext,
  CombinedPurchaseOrderDocumentContext,
} from './purchase-order-document.util';
import { buildPackingReceiptTemplateBuffer, PackingReceiptTemplateContext } from './packing-receipt-template.util';

// PR-244a: 서버 생성 문서의 통화 라벨·합계. KRW(NULL 포함)만 있으면 이전과 같은 출력이어야 한다.
const base: PurchaseOrderDocumentContext = {
  purchaseOrderId: 7, orderDate: '2026-10-04', requiredDate: '2026-12-15', supplierName: '공급사', supplierContact: '02-1', supplierAddress: '서울',
  itemName: '원단', itemEnglishName: 'FABRIC', composition: 'WOOL 100%', hsCode: '5111', styleNo: 'ST-1', factory: '베트남',
  quantity: 10, unitPrice: 2.5, notes: null, lines: [],
};
const find = (rows: any[][], label: string) => rows.find((r) => r[0] === label);

describe('발주서 통화 라벨·합계 (PR-244a)', () => {
  const line = (over: Partial<CombinedPurchaseOrderDocumentContext['lines'][number]>) => ({
    purchaseOrderId: 1, categoryGroup: '부자재', materialSubTypeLabel: null, itemCode: null, itemName: '합성자재', unit: 'EA',
    styleNo: 'ST-1', quantity: 10, unitPrice: 2, requiredDate: null, notes: null, ...over,
  });
  const ctxOf = (lines: any[]): CombinedPurchaseOrderDocumentContext => ({ orderDate: '2026-11-19', supplierName: '합성공급사', supplierContact: null, supplierAddress: null, lines });

  it('단건: KRW/통화 없음은 라벨이 이전과 같고, USD 는 단가(USD)·금액(USD)', () => {
    expect(find(buildPurchaseOrderDocumentSheetData(base), '단가')?.[1]).toBe(2.5);
    expect(find(buildPurchaseOrderDocumentSheetData({ ...base, currency: 'KRW' }), '금액')?.[1]).toBe(25);
    const usd = buildPurchaseOrderDocumentSheetData({ ...base, currency: 'USD' });
    expect(find(usd, '단가')).toBeUndefined();
    expect(find(usd, '단가(USD)')?.[1]).toBe(2.5);
    expect(find(usd, '금액(USD)')?.[1]).toBe(25);
  });

  it('합본: KRW(NULL 포함)만 있으면 통화 열 없이 이전과 동일한 행 구성', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(ctxOf([line({}), line({ currency: 'KRW', itemName: '합성자재2', unitPrice: 3 })]));
    expect(rows.every((r) => r.length <= 9)).toBe(true);
    expect(rows[8]).toHaveLength(9);
    expect(rows[rows.length - 1]).toEqual(['', '업체 전체 합계', '', '', 20, '', 50, '', '']);
  });

  it('합본: USD 행이 섞이면 통화 열이 생기고, 기존 합계 칸은 KRW 만 합산 + 통화별 합계 행', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(ctxOf([line({}), line({ currency: 'USD', itemName: '합성달러자재', unitPrice: 1.5 })]));
    expect(rows[8][9]).toBe('통화');
    const krwTotal = rows.find((r) => r[1] === '업체 전체 합계')!;
    expect(krwTotal[6]).toBe(20); // KRW 만(2×10), USD 15 는 섞이지 않는다
    expect(krwTotal[9]).toBe('KRW');
    const usdTotal = rows.find((r) => r[1] === '업체 전체 합계(USD)')!;
    expect(usdTotal[6]).toBe(15);
    expect(usdTotal[9]).toBe('USD');
  });

  it('합본: 같은 품목에 통화가 섞이면 단가를 하나로 합치지 않고 소계 금액은 미정', () => {
    const rows = buildCombinedPurchaseOrderDocumentSheetData(ctxOf([line({}), line({ currency: 'USD', unitPrice: 2 })]));
    const sub = rows.find((r) => String(r[1]).endsWith('소계'))!;
    expect(sub[5]).toBe(PRICE_PENDING_NOTE);
    expect(sub[9]).toBe('혼합');
  });
});

describe('표준양식 발주단가 통화 라벨 (PR-244a)', () => {
  const baseCtx: PackingReceiptTemplateContext = {
    purchaseOrderId: 1, styleNo: 'ST-1', brand: null, buyer: null, factory: null, supplierName: '합성공급사', orderedDate: null, targetRdd: null,
    itemName: '합성자재', itemEnglishName: null, composition: null, hsCode: null, unitPrice: 12000, quantity: 500, midoPriceCandidates: [],
  } as PackingReceiptTemplateContext;
  const labelRows = (ctx: PackingReceiptTemplateContext) => {
    const wb = xlsx.read(buildPackingReceiptTemplateBuffer(ctx, 'TRIM'), { type: 'buffer' });
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    return rows.filter((r) => String(r[0]).startsWith('발주단가')).map((r) => r.slice(0, 2));
  };

  it('통화 없음/KRW 는 이전과 같은 "발주단가(KRW)"', () => {
    expect(labelRows(baseCtx)).toEqual([['발주단가(KRW)', 12000]]);
    expect(labelRows({ ...baseCtx, currency: 'KRW' })[0][0]).toBe('발주단가(KRW)');
  });

  it('USD 단가는 "발주단가(USD)" — KRW 라고 거짓 표기하지 않는다', () => {
    expect(labelRows({ ...baseCtx, unitPrice: 2.5, currency: 'USD' })).toEqual([['발주단가(USD)', 2.5]]);
  });
});
