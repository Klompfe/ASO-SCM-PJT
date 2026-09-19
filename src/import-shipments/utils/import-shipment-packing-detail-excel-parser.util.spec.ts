import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { ImportShipmentPackingDetailExcelParser } from './import-shipment-packing-detail-excel-parser.util';

const DOCS = path.resolve(__dirname, '../../../docs');
const load = (name: string) => fs.readFileSync(path.join(DOCS, name));

const sumBy = (rows: { styleNo: string; qty: number }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.styleNo, (m.get(r.styleNo) ?? 0) + r.qty);
  return m;
};

const workbookBuffer = (sheetName: string, aoa: any[][]): Buffer => {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(aoa), sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// PR-112: 실제 파일 3개(TYVN2026-21/22/27 검토완료.xlsx) 기준 스냅샷 — 각 스타일 합계는
// 시트에 적힌 "계"/TOTAL 값과 전부 일치해야 한다.
describe('ImportShipmentPackingDetailExcelParser — 실제 파일', () => {
  it('TYVN2026-21 (적재순): 13개 스타일, 스타일별 합계와 전체 4,372가 시트의 계/TOTAL과 일치', () => {
    const result = ImportShipmentPackingDetailExcelParser.parse(load('TYVN2026-21(검토완료).xlsx'))!;
    expect(result.sheetName).toBe('적재순');

    const byStyle = sumBy(result.rows);
    expect(Object.fromEntries(byStyle)).toEqual({
      LB69SKM101Z: 184,
      LB69SLM101A: 186,
      LB69SLM104Z: 191,
      VB69SLM103Z: 296,
      LB69SLM102Z: 186,
      LB69SLM105Z: 102,
      MB6YHMP104Z: 1345,
      LB69BLM102Z: 275,
      SK0H3D01: 200,
      DR0G6D02: 323,
      DR0H6D01: 180,
      BF6821C52: 409,
      BF6821C54: 495,
    });
    expect(result.rows.reduce((a, r) => a + r.qty, 0)).toBe(4372);
    expect(result.rows).toHaveLength(55);
  });

  it('TYVN2026-21: 사이즈명은 헤더 첫 줄만 쓴다(XS/S/M) — LB69SLM102Z GR = XS 52, S 46', () => {
    const { rows } = ImportShipmentPackingDetailExcelParser.parse(load('TYVN2026-21(검토완료).xlsx'))!;
    const gr = rows.filter((r) => r.styleNo === 'LB69SLM102Z' && r.color === 'GR');
    expect(gr).toEqual([
      { styleNo: 'LB69SLM102Z', color: 'GR', size: 'XS', qty: 52 },
      { styleNo: 'LB69SLM102Z', color: 'GR', size: 'S', qty: 46 },
    ]);
  });

  it('TYVN2026-21: STYLE NO 빈칸은 위 행 스타일을 이어받는다(VB69SLM103Z 3색)', () => {
    const { rows } = ImportShipmentPackingDetailExcelParser.parse(load('TYVN2026-21(검토완료).xlsx'))!;
    const colors = new Set(rows.filter((r) => r.styleNo === 'VB69SLM103Z').map((r) => r.color));
    expect([...colors].sort()).toEqual(['BE', 'BK', 'DG']);
  });

  it('TYVN2026-22 (DETAIL PACKING): BF6821C13 합계 631, 같은 색(IV)이 두 행이면 합산, "\\r\\n8" 헤더는 8', () => {
    const result = ImportShipmentPackingDetailExcelParser.parse(load('TYVN2026-22 검토완료.xlsx'))!;
    expect(result.sheetName).toBe('DETAIL PACKING');
    expect(result.rows).toHaveLength(6);
    expect(result.rows.reduce((a, r) => a + r.qty, 0)).toBe(631);
    // IV: 26=51+4, 27=95+4, 28=98+4 / Y/BR: 26=96, 27=110, 28=169
    expect(result.rows.find((r) => r.color === 'IV' && r.size === '26')!.qty).toBe(55);
    expect(result.rows.find((r) => r.color === 'IV' && r.size === '27')!.qty).toBe(99);
    expect(result.rows.find((r) => r.color === 'IV' && r.size === '28')!.qty).toBe(102);
    expect(result.rows.find((r) => r.color === 'Y/BR' && r.size === '28')!.qty).toBe(169);
  });

  it('TYVN2026-27: 품번별(집계형)을 박스보다 우선 사용, BF6827C51 합계 808, TOTAL이 STYLE NO 열에 있어도 종료', () => {
    const result = ImportShipmentPackingDetailExcelParser.parse(load('TYVN2026-27(검토완료).xlsx'))!;
    expect(result.sheetName).toBe('품번별');
    expect(result.rows).toHaveLength(8);
    expect(result.rows.reduce((a, r) => a + r.qty, 0)).toBe(808);
    expect(result.rows.find((r) => r.color === 'ASH' && r.size === 'S')!.qty).toBe(234);
  });
});

describe('ImportShipmentPackingDetailExcelParser — 시트 이름/구조 변형', () => {
  const HEADER_BASIC = ['구분', 'STYLE NO', 'COLOR', 'BOX', 'S', 'M', '소계', '계'];

  it.each(['DETAIL PACKING', '품번별', '적재순'])('%s 시트 이름을 인식한다', (sheetName) => {
    const buf = workbookBuffer(sheetName, [
      HEADER_BASIC,
      ['X', 'AA1', 'BK', 'BOX', 3, 4, 7],
      ['TOTAL', null, null, null, null, null, 7],
    ]);
    const result = ImportShipmentPackingDetailExcelParser.parse(buf)!;
    expect(result.sheetName).toBe(sheetName);
    expect(result.rows).toEqual([
      { styleNo: 'AA1', color: 'BK', size: 'S', qty: 3 },
      { styleNo: 'AA1', color: 'BK', size: 'M', qty: 4 },
    ]);
  });

  it('박스 시트(BOX No가 STYLE NO 앞): 카톤별 행을 스타일+색상+사이즈로 합산한다', () => {
    const buf = workbookBuffer('박스', [
      ['구분', 'BOX No', 'STYLE NO', 'COLOR', 'S', 'M', '소계', '계'],
      ['AIR', '1', 'BB2', 'ASH', 70, null, 70, 70],
      [null, '2', null, 'ASH', 70, 5, 75, 75],
      [null, '3', null, 'NA', null, 9, 9, 9],
      ['TOTAL', '3', '', null, 140, 14, 154],
    ]);
    const result = ImportShipmentPackingDetailExcelParser.parse(buf)!;
    expect(result.sheetName).toBe('박스');
    expect(result.rows).toEqual([
      { styleNo: 'BB2', color: 'ASH', size: 'S', qty: 140 },
      { styleNo: 'BB2', color: 'ASH', size: 'M', qty: 5 },
      { styleNo: 'BB2', color: 'NA', size: 'M', qty: 9 },
    ]);
  });

  it('TOTAL 행을 만나면 그 아래 데이터는 무시한다', () => {
    const buf = workbookBuffer('DETAIL PACKING', [
      HEADER_BASIC,
      ['X', 'AA1', 'BK', 'BOX', 3, null, 3],
      ['TOTAL', null, null, null, null, null, 3],
      [null, 'ZZ9', 'RD', 'BOX', 99, null, 99],
    ]);
    const result = ImportShipmentPackingDetailExcelParser.parse(buf)!;
    expect(result.rows.map((r) => r.styleNo)).toEqual(['AA1']);
  });

  it('수량 0/빈칸/"-"는 레코드로 만들지 않고, 천단위 콤마 숫자는 정상 파싱한다', () => {
    const buf = workbookBuffer('DETAIL PACKING', [
      HEADER_BASIC,
      ['X', 'AA1', 'BK', 'BOX', 0, '1,234', 1234],
      [null, null, 'RD', 'BOX', '-', null, 0],
    ]);
    const result = ImportShipmentPackingDetailExcelParser.parse(buf)!;
    expect(result.rows).toEqual([{ styleNo: 'AA1', color: 'BK', size: 'M', qty: 1234 }]);
  });

  it('상세포장내역 시트가 없는 파일은 null(에러 아님)', () => {
    const buf = workbookBuffer('IV FOB', [['a', 'b']]);
    expect(ImportShipmentPackingDetailExcelParser.parse(buf)).toBeNull();
  });
});
