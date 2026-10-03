import {
  buildPackingReceiptTemplateBuffer,
  parsePackingReceiptTemplate,
  PackingReceiptTemplateContext,
} from './packing-receipt-template.util';

const baseCtx: PackingReceiptTemplateContext = {
  purchaseOrderId: 42,
  styleNo: '26FHC21',
  brand: '뮤트',
  buyer: '크롬컴퍼니',
  factory: '베트남',
  supplierName: '장수직물',
  orderedDate: '2026-09-01',
  targetRdd: '2026-12-15',
  itemName: '겉감원단',
  itemEnglishName: 'Outer Fabric',
  composition: 'WOOL 98%, POLYURETHANE 2%',
  hsCode: '5111.11',
  unitPrice: 12000,
  quantity: 500,
  midoPriceCandidates: [],
};

describe('packing-receipt-template.util — 생성→파싱 라운드트립 (PR-169)', () => {
  it('FABRIC 양식을 생성하고 예시 행 위에 실제 롤 데이터를 채워 넣으면 그대로 파싱된다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Roll No.');
    rows[headerIdx + 2] = ['2', 'R-002', 'WHITE', 150, 59.06, 50, 48, 20, 80, ''];
    rows[headerIdx + 3] = ['3', 'R-003', 'WHITE', 150, 59.06, 52, 50, 20, 82, ''];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    const editedBuffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    const result = parsePackingReceiptTemplate(editedBuffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '26FHC21' });

    expect(result.rolls).toHaveLength(2);
    expect(result.rolls[0]).toEqual({
      rollNo: 'R-002', color: 'WHITE', widthCm: 150, widthInch: 59.06, grossWeight: 50, netWeight: 48, thickness: 20, lengthYd: 80,
    });
    expect(result.cartons).toEqual([]);
  });

  it('예시 행(마커 포함)만 있고 실제 데이터가 없으면 예시 행은 제외되고(0건) 오류로 안내한다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'TRIM');
    expect(() => parsePackingReceiptTemplate(buffer, 'TRIM', { purchaseOrderId: 42, styleNo: '26FHC21' })).toThrow(
      /유효한 데이터 행/,
    );
  });

  it('예시 행과 실제 데이터 행이 함께 있으면 예시 행만 제외하고 실제 행만 반환한다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'TRIM');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Carton No.');
    rows[headerIdx + 2] = ['2', 'T.I-2', 'BLACK', 'FREE', 'LOT-002', 200, '메인라벨', 15.5, ''];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    const editedBuffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    const result = parsePackingReceiptTemplate(editedBuffer, 'TRIM', { purchaseOrderId: 42, styleNo: '26FHC21' });
    expect(result.cartons).toHaveLength(1);
    expect(result.cartons[0].cartonNo).toBe('T.I-2');
  });

  it('TRIM 양식에 카톤 데이터를 채우면 파싱된다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'TRIM');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Carton No.');
    rows[headerIdx + 2] = ['2', 'T.I-2', 'BLACK', 'FREE', 'LOT-002', 200, '메인라벨', 15.5, ''];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    const editedBuffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    const result = parsePackingReceiptTemplate(editedBuffer, 'TRIM', { purchaseOrderId: 42, styleNo: '26FHC21' });
    expect(result.cartons).toEqual([
      { cartonNo: 'T.I-2', color: 'BLACK', size: 'FREE', lotNo: 'LOT-002', qty: 200, itemName: '메인라벨', weightKg: 15.5 },
    ]);
  });

  it('요약행의 CBM/포장수/포장형태를 읽는다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Roll No.');
    rows[headerIdx + 2] = ['2', 'R-002', 'WHITE', 150, 59.06, 50, 48, 20, 80, ''];
    const summaryIdx = rows.findIndex((r) => r[0] === 'CBM');
    rows[summaryIdx] = ['CBM', 3.2, '포장수', 1, '포장형태', '원단롤'];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    const editedBuffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    const result = parsePackingReceiptTemplate(editedBuffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '26FHC21' });
    expect(result.cbm).toBe(3.2);
    expect(result.packageType).toBe('원단롤');
    expect(result.declaredPackageCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('요약행의 포장수가 실제 롤 수와 다르면 경고를 반환한다(저장은 막지 않음)', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerIdx = rows.findIndex((r) => r[0] === 'No.' && r[1] === 'Roll No.');
    rows[headerIdx + 2] = ['2', 'R-002', 'WHITE', 150, 59.06, 50, 48, 20, 80, ''];
    const summaryIdx = rows.findIndex((r) => r[0] === 'CBM');
    rows[summaryIdx] = ['CBM', 3.2, '포장수', 5, '포장형태', '원단롤'];

    const newSheet = xlsx.utils.aoa_to_sheet(rows);
    const newWb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWb, newSheet, wb.SheetNames[0]);
    const editedBuffer = xlsx.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    const result = parsePackingReceiptTemplate(editedBuffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '26FHC21' });
    expect(result.warnings[0]).toContain('포장수(5)');
  });

  it('PO No.가 다른 발주의 양식이면 저장을 막고 오류를 던진다(안전모드)', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    expect(() => parsePackingReceiptTemplate(buffer, 'FABRIC', { purchaseOrderId: 999, styleNo: '26FHC21' })).toThrow(
      /PO No/,
    );
  });

  it('스타일번호가 실제 발주 정보와 다르면 저장을 막고 오류를 던진다(안전모드)', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    expect(() => parsePackingReceiptTemplate(buffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '다른스타일' })).toThrow(
      /스타일번호/,
    );
  });

  it('표준양식 시그니처가 없는 임의의 엑셀 파일은 거부한다', () => {
    const xlsx = require('xlsx');
    const sheet = xlsx.utils.aoa_to_sheet([['아무 파일'], ['내용']]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(() => parsePackingReceiptTemplate(buffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '26FHC21' })).toThrow(
      /표준양식/,
    );
  });

  it('데이터 행이 전부 비어 있으면(예시 행만 있음) 오류를 던진다', () => {
    const buffer = buildPackingReceiptTemplateBuffer(baseCtx, 'FABRIC');
    expect(() => parsePackingReceiptTemplate(buffer, 'FABRIC', { purchaseOrderId: 42, styleNo: '26FHC21' })).toThrow(
      /유효한 데이터 행/,
    );
  });

  it('발주단가가 없고 미도 단가표 후보가 있으면 참고용 컨텍스트 행이 포함된다', () => {
    const ctxNoPrice: PackingReceiptTemplateContext = {
      ...baseCtx,
      unitPrice: null,
      midoPriceCandidates: [{ itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'EA' }],
    };
    const buffer = buildPackingReceiptTemplateBuffer(ctxNoPrice, 'FABRIC');
    const xlsx = require('xlsx');
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const row = rows.find((r) => String(r[0]).includes('미도단가표'));
    expect(row?.[1]).toContain('겉감(WOOL 60~70%): $2.5~$3/EA');
  });
});
