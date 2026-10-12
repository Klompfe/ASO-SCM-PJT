import { parseMidoPriceCsv, MidoPriceCsvParseError } from './mido-price-csv-parser.util';

const HEADER = 'itemName,priceUsdMin,priceUsdMax,unit,note';

describe('parseMidoPriceCsv (PR-188)', () => {
  it('기본 CSV를 파싱한다', () => {
    const csv = `${HEADER}\n겉감(WOOL),2.5,3,YD,비고1\n실(THREAD),0.00012,0.00012,M,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 1, itemName: '겉감(WOOL)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'YD', note: '비고1', errors: [] });
    expect(rows[1]).toMatchObject({ line: 2, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M', note: null, errors: [] });
  });

  it('UTF-8 BOM을 제거하고 파싱한다', () => {
    const csv = `﻿${HEADER}\n겉감,1,1,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].itemName).toBe('겉감');
  });

  it('CRLF 줄바꿈도 정상 처리한다', () => {
    const csv = `${HEADER}\r\n겉감,1,1,YD,\r\n안감,2,2,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].itemName).toBe('안감');
  });

  it('따옴표로 감싼 필드 안의 쉼표는 구분자로 보지 않는다(실제 등록 예정 데이터 사례)', () => {
    const csv = `${HEADER}\n"겉감(POLYESTER 95%, POLYURETHANE 5%)",1.2,1.5,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].itemName).toBe('겉감(POLYESTER 95%, POLYURETHANE 5%)');
    expect(rows[0].priceUsdMin).toBe(1.2);
  });

  it('필드 안의 큰따옴표(인치 표기)는 ""로 이스케이프해 리터럴 "로 복원한다(실제 등록 예정 데이터 사례)', () => {
    const csv = `${HEADER}\n"안감(LINING POLYESTER 100%) 58""/60""",0.5,0.5,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].itemName).toBe('안감(LINING POLYESTER 100%) 58"/60"');
  });

  it('priceUsdMax가 비어 있으면 priceUsdMin과 같은 값으로 채운다', () => {
    const csv = `${HEADER}\n겉감,2.5,,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].priceUsdMax).toBe(2.5);
  });

  it('priceUsdMin이 숫자가 아니면 에러를 담는다(저장하지 않고 보고만)', () => {
    const csv = `${HEADER}\n겉감,abc,3,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].errors).toContain('priceUsdMin은 0 이상, 소수 최대 6자리의 숫자여야 합니다.');
  });

  it('소수 7자리 이상이면 에러', () => {
    const csv = `${HEADER}\n겉감,1.1234567,2,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].errors.some((e) => e.includes('소수 최대 6자리'))).toBe(true);
  });

  it('priceUsdMin이 priceUsdMax보다 크면 에러', () => {
    const csv = `${HEADER}\n겉감,5,3,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].errors).toContain('priceUsdMin은 priceUsdMax보다 클 수 없습니다.');
  });

  it('itemName/unit이 비어 있으면 각각 에러', () => {
    const csv = `${HEADER}\n,1,1,,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].errors).toContain('itemName은 비어 있을 수 없습니다.');
    expect(rows[0].errors).toContain('unit은 비어 있을 수 없습니다.');
  });

  it('같은 파일 안에 itemName이 중복되면 해당 행 전부 에러(어느 쪽을 쓸지 모호)', () => {
    const csv = `${HEADER}\n겉감,1,1,YD,\n겉감,2,2,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows[0].errors.some((e) => e.includes('중복') || e.includes('번 나옵니다'))).toBe(true);
    expect(rows[1].errors.some((e) => e.includes('번 나옵니다'))).toBe(true);
  });

  it('헤더가 누락되면 파싱 자체를 거절한다', () => {
    expect(() => parseMidoPriceCsv('itemName,priceUsdMin,unit\n겉감,1,YD')).toThrow(MidoPriceCsvParseError);
  });

  it('빈 CSV는 거절한다', () => {
    expect(() => parseMidoPriceCsv('')).toThrow(MidoPriceCsvParseError);
    expect(() => parseMidoPriceCsv('   \n  ')).toThrow(MidoPriceCsvParseError);
  });

  it('헤더만 있고 데이터 행이 없으면 빈 배열', () => {
    const { rows } = parseMidoPriceCsv(HEADER);
    expect(rows).toEqual([]);
  });

  it('완전히 빈 줄(서식상의 여백)은 건너뛴다', () => {
    const csv = `${HEADER}\n겉감,1,1,YD,\n\n\n안감,2,2,YD,`;
    const { rows } = parseMidoPriceCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.line)).toEqual([1, 2]);
  });
});
