import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { SalesContractPriceImportParser } from './sales-contract-price-import-parser.util';

const HEADER = ['No.', 'Style No.', 'Description', 'Quantity', 'Unit', 'Unit Price', 'Amount', 'Source File'];

function buildWorkbook(rows: Array<Array<string | number>>, sheetName = '통합'): Buffer {
  const ws = xlsx.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('SalesContractPriceImportParser (PR-166)', () => {
  it('정상 케이스: 실제 통합본 구조를 그대로 파싱한다', () => {
    const buffer = buildWorkbook([
      [1, 'KM2677JP001M', "WOMEN'S JUMPER", 150, 'PCS', 7, 1050, '26FW0822_SALES_CONTRACT-전달용.xlsx'],
      [2, '26FOT08', "WOMEN'S JACKET", 150, 'PCS', 5.5, 825, '26FW0822_SALES_CONTRACT-전달용.xlsx'],
    ]);

    const { rows, skippedCount } = SalesContractPriceImportParser.parse(buffer);

    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      styleNo: 'KM2677JP001M',
      category: "WOMEN'S JUMPER",
      quantity: 150,
      unit: 'PCS',
      unitPrice: 7,
      amount: 1050,
      sourceFile: '26FW0822_SALES_CONTRACT-전달용.xlsx',
    });
  });

  it('Style No나 Unit Price가 비어 있으면 건너뛴다(평균 계산 오염 방지)', () => {
    const buffer = buildWorkbook([
      [1, '', "WOMEN'S PANTS", 100, 'PCS', 5, 500, 'a.xlsx'],
      [2, 'BF6821C13', '', 100, 'PCS', '', '', 'b.xlsx'],
      [3, 'BF6821E93', '', 702, 'PCS', 6, 4212, 'c.xlsx'], // Description 공란은 그대로 허용(실데이터에도 있음)
    ]);

    const { rows, skippedCount } = SalesContractPriceImportParser.parse(buffer);

    expect(skippedCount).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ styleNo: 'BF6821E93', category: null, unitPrice: 6 });
  });

  it('완전히 빈 여백 행은 조용히 무시한다(건너뛴 건수에도 안 센다)', () => {
    const buffer = buildWorkbook([
      ['', '', '', '', '', '', '', ''],
      [1, 'BF6821C13', "WOMEN'S PANTS", 100, 'PCS', 4.5, 450, 'a.xlsx'],
    ]);

    const { rows, skippedCount } = SalesContractPriceImportParser.parse(buffer);

    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(1);
  });

  it("헤더를 못 찾으면 BadRequestException", () => {
    const ws = xlsx.utils.aoa_to_sheet([['엉뚱한', '헤더'], ['a', 'b']]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(() => SalesContractPriceImportParser.parse(buffer)).toThrow(BadRequestException);
  });

  it('시트명이 달라도("통합" 아닌 임의 이름) 헤더로 찾아 파싱한다', () => {
    const buffer = buildWorkbook([[1, 'BF6821C13', "WOMEN'S PANTS", 100, 'PCS', 4.5, 450, 'a.xlsx']], 'Sheet1');
    const { rows } = SalesContractPriceImportParser.parse(buffer);
    expect(rows).toHaveLength(1);
  });

  it('rowNumber는 실제로 채택된 행 기준 1부터 순차 부여된다(건너뛴 행은 건너뜀)', () => {
    const buffer = buildWorkbook([
      [1, '', "WOMEN'S PANTS", 100, 'PCS', '', '', 'a.xlsx'], // skip
      [2, 'BF6821C13', "WOMEN'S PANTS", 100, 'PCS', 4.5, 450, 'a.xlsx'],
      [3, 'BF6821C14', "WOMEN'S PANTS", 100, 'PCS', 5, 500, 'a.xlsx'],
    ]);
    const { rows } = SalesContractPriceImportParser.parse(buffer);
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });
});
