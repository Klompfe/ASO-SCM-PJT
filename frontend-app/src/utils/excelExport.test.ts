import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook, type ExcelColumn } from './excelExport';

interface Row {
  styleNo: string;
  qty: number;
  note: string | null;
}

const rows: Row[] = [
  { styleNo: 'MB62SLM103Z', qty: 100, note: '정상' },
  { styleNo: 'MB6YSLM115Z', qty: 250, note: null },
];

const columns: ExcelColumn<Row>[] = [
  { header: 'Style No', accessor: (r) => r.styleNo },
  { header: '수량', accessor: (r) => r.qty },
  { header: '비고', accessor: (r) => r.note },
];

// PR-110: 라이브러리로 만든 워크북을 다시 파싱해 원본 데이터와 비교한다 — "엑셀에서
// 열었을 때 실제로 화면 데이터와 일치하는지"를 라운드트립으로 검증하는 방식.
describe('buildWorkbook', () => {
  it('헤더 행과 데이터 행이 컬럼 정의/원본 데이터와 정확히 일치한다', async () => {
    const workbook = await buildWorkbook(columns, rows);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    expect(parsed[0]).toEqual(['Style No', '수량', '비고']);
    expect(parsed[1]).toEqual(['MB62SLM103Z', 100, '정상']);
    expect(parsed[2]).toEqual(['MB6YSLM115Z', 250, '']);
  });

  it('null/undefined 값은 빈 문자열로 대체되고, 숫자는 숫자 타입 그대로 저장된다', async () => {
    const workbook = await buildWorkbook(columns, rows);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // B2/B3 = 수량 컬럼 값 — 셀 타입이 숫자(n)여야 엑셀에서 정렬/합계가 깨지지 않는다.
    expect(sheet['B2'].t).toBe('n');
    expect(sheet['B2'].v).toBe(100);
    expect(sheet['B3'].t).toBe('n');
    expect(sheet['B3'].v).toBe(250);
    // C3 = note가 null인 행 — 빈 문자열로 저장(undefined 셀이 아니라 실제 빈 값).
    expect(sheet['C3'].v).toBe('');
  });

  it('행이 없어도(빈 배열) 헤더만 있는 워크북을 정상 생성한다', async () => {
    const workbook = await buildWorkbook(columns, []);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    expect(parsed).toEqual([['Style No', '수량', '비고']]);
  });

  it('시트 이름을 지정하면 워크북에 그 이름으로 등록된다', async () => {
    const workbook = await buildWorkbook(columns, rows, '재고현황');
    expect(workbook.SheetNames).toEqual(['재고현황']);
  });

  it('Date 값을 그대로 넘기면 셀에 날짜로 저장된다', async () => {
    interface DatedRow { d: Date }
    const dateRows: DatedRow[] = [{ d: new Date('2026-09-19T00:00:00Z') }];
    const dateColumns: ExcelColumn<DatedRow>[] = [{ header: '일자', accessor: (r) => r.d }];

    const workbook = await buildWorkbook(dateColumns, dateRows);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet['A2'].v instanceof Date).toBe(true);
    expect((sheet['A2'].v as Date).toISOString()).toBe('2026-09-19T00:00:00.000Z');
  });
});
