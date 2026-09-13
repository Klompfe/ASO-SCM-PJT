import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { HsCodeClassificationImportParser } from './hs-code-classification-import-parser.util';

const HEADER = ['No.', 'Style No.', 'Item', '재직', '혼용률', 'HS. CODE', '관,부가세 유무'];

function buildWorkbook(rows: Array<Array<string | number>>): Buffer {
  const ws = xlsx.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('HsCodeClassificationImportParser', () => {
  it('정상 케이스: 데이터 행을 그대로 파싱한다', () => {
    const buffer = buildWorkbook([
      [
        1,
        'BF6X27C51',
        "WOMEN'S JACKET",
        '직물',
        'WOOL 98%, POLYURETHANE 2%',
        '6202.20.1000',
        '관세 유',
      ],
    ]);

    const { rows, skippedCount } = HsCodeClassificationImportParser.parse(buffer);

    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      styleNo: 'BF6X27C51',
      itemType: "WOMEN'S JACKET",
      fabricType: '직물',
      composition: 'WOOL 98%, POLYURETHANE 2%',
      hsCode: '6202.20.1000',
      note: '관세 유',
    });
  });

  it('Style No가 빈칸이거나 "0"인 행은 건너뛴다', () => {
    const buffer = buildWorkbook([
      [1, '', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', ''],
      [2, '0', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', ''],
      [3, 'BF6X27C99', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', ''],
    ]);

    const { rows, skippedCount } = HsCodeClassificationImportParser.parse(buffer);

    expect(skippedCount).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].styleNo).toBe('BF6X27C99');
  });

  it('재직 컬럼의 선행 공백 표기 차이를 trim으로 정규화한다', () => {
    const buffer = buildWorkbook([
      [1, 'STY-001', "WOMEN'S COAT", '  직물', 'WOOL 100%', '6202.20.1000', ''],
      [2, 'STY-002', "WOMEN'S COAT", '직물', 'WOOL 100%', '6202.20.1000', ''],
    ]);

    const { rows } = HsCodeClassificationImportParser.parse(buffer);

    expect(rows.every((r) => r.fabricType === '직물')).toBe(true);
  });

  it('헤더 텍스트가 공백/줄바꿈 표기 차이가 있어도 정규화 매칭으로 헤더를 찾는다', () => {
    const looseHeader = ['No.', 'Style\nNo.', ' Item ', '재 직', '혼 용 률', 'HS.  CODE', '관,부가세  유무'];
    const ws = xlsx.utils.aoa_to_sheet([
      looseHeader,
      [1, 'STY-100', "WOMEN'S VEST", '직물', 'COTTON 100%', '6110.20.0000', ''],
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const { rows } = HsCodeClassificationImportParser.parse(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0].styleNo).toBe('STY-100');
  });

  it('인식 가능한 헤더가 없으면 400 에러를 던진다', () => {
    const ws = xlsx.utils.aoa_to_sheet([['엉뚱한', '헤더', '입니다']]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(() => HsCodeClassificationImportParser.parse(buffer)).toThrow(BadRequestException);
  });

  it('같은 (품종,재직,혼용률) 조합이 서로 다른 행에 나오는 경우도 각 행 그대로 반환한다 (충돌 판정은 서비스 레이어 책임)', () => {
    const buffer = buildWorkbook([
      [1, 'STY-A', "WOMEN'S PANTS", '직물', 'COTTON 100%', '6204.62.0000', ''],
      [2, 'STY-B', "WOMEN'S PANTS", '직물', 'COTTON 100%', '6204.62.9000', ''],
    ]);

    const { rows } = HsCodeClassificationImportParser.parse(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0].hsCode).toBe('6204.62.0000');
    expect(rows[1].hsCode).toBe('6204.62.9000');
  });
});
