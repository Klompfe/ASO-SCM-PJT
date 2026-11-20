import { SectionParser } from './section-parser.util';

// PR-248: MATERIAL LIST "혼용률/중량" 열 읽기 — 합성 시트(실제 파일·업무 데이터 없음).
// 열은 고정 번호가 아니라 헤더 텍스트('혼용률' 포함)로 찾는다. 값은 PR-247 checkComposition 규칙(trim 외 변환 없음).
const HEADER_LABEL = '혼용률\n중량';

function buildSheet(options: { compositionHeaderAt?: number | null; header?: string; rows: { category: string; composition?: unknown }[] }): string[][] {
  const width = 30;
  const blank = () => Array.from({ length: width }, () => '');
  const rows: string[][] = Array.from({ length: 13 }, blank);
  rows[1][1] = 'SYN-STYLE-001';
  rows[1][8] = '100';
  rows[1][14] = '베트남';
  rows[1][21] = '테스트바이어';
  const header = blank();
  header[0] = 'ITEMS';
  header[1] = 'QTY';
  header[2] = 'COLOR OF';
  header[10] = "CON'S";
  const at = options.compositionHeaderAt === undefined ? 26 : options.compositionHeaderAt;
  if (at !== null) header[at] = options.header ?? HEADER_LABEL;
  rows.push(header); // index 13
  rows.push(blank()); // 서브헤더(index 14)
  options.rows.forEach((r, i) => {
    const row = blank();
    row[0] = r.category;
    row[2] = 'BK';
    row[8] = `SPEC${i}`;
    row[10] = '1';
    if (at !== null) (row as unknown[])[at] = r.composition as unknown;
    rows.push(row);
  });
  return rows;
}

const parse = (sheet: string[][]) => SectionParser.parse(sheet, []);

describe('SectionParser — 혼용률/중량 열 (PR-248)', () => {
  it('헤더에 "혼용률"이 들어 있는 열의 값을 각 행의 composition 으로 읽는다', () => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: 'COTTON 60% POLYESTER 40%' }, { category: '안감', composition: 'POLYESTER 100%' }] }));
    expect(bomItems.map((i: any) => i.composition)).toEqual(['COTTON 60% POLYESTER 40%', 'POLYESTER 100%']);
  });

  it('열 번호가 달라도(헤더 위치 기준) 읽는다 — 고정 열 번호에 의존하지 않는다', () => {
    const { bomItems } = parse(buildSheet({ compositionHeaderAt: 22, rows: [{ category: '겉감', composition: 'A 100%' }] }));
    expect(bomItems[0].composition).toBe('A 100%');
  });

  it.each([
    'R/N/SP=56/40/4',
    'c/p=60/40',
    'Cotton 60% polyester 40%',
    'SHELL : COTTON 60%,  POLYESTER 40% / LINING : P100%',
    '면 60% 폴리에스터 40%',
  ])('값 %p 는 글자 하나 바뀌지 않고 그대로 읽힌다', (value) => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: value }] }));
    expect(bomItems[0].composition).toBe(value);
  });

  it('앞뒤 공백만 제거한다', () => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: '  A/B = 60/40 \n' }] }));
    expect(bomItems[0].composition).toBe('A/B = 60/40');
  });

  it.each(['', '   ', '-', '—', 'N/A', 'n/a', 'NA', '없음', '해당없음', 'NULL', ' Null '])('빈 값/자리표시자 %p 는 composition 필드 자체가 없다(엑셀 빈 칸이 기존 값을 지우지 않도록)', (value) => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: value }] }));
    expect('composition' in bomItems[0]).toBe(false);
  });

  it('숫자형 셀은 문자열로 안전하게 변환된다', () => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: 100 }] }));
    expect(bomItems[0].composition).toBe('100');
  });

  it.each([true, { a: 1 }, ['x']])('문자열·숫자가 아닌 셀 값 %p 는 읽지 않는다', (value) => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '겉감', composition: value }] }));
    expect('composition' in bomItems[0]).toBe(false);
  });

  it('500자 초과는 읽지 않고(null) 경고를 남긴다, 500자는 통과', () => {
    const { bomItems, warnings } = parse(buildSheet({ rows: [{ category: '겉감', composition: 'A'.repeat(501) }, { category: '안감', composition: 'A'.repeat(500) }] }));
    expect('composition' in bomItems[0]).toBe(false);
    expect(bomItems[1].composition).toBe('A'.repeat(500));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('너무 길어');
  });

  it('혼용률 열이 없으면(헤더 없음) 아무 일도 없다 — 기존 필드 그대로, 경고 없음', () => {
    const { bomItems, warnings } = parse(buildSheet({ compositionHeaderAt: null, rows: [{ category: '겉감' }] }));
    expect(bomItems[0]).toEqual({ category: '겉감', itemName: '겉감', consumption: 1, requiredQty: 100, colorOf: 'BK', spec: 'SPEC0' });
    expect(warnings).toEqual([]);
  });

  it('헤더가 "혼용률"이 아닌 다른 이름이면 그 열은 읽지 않는다(헤더 불일치)', () => {
    const { bomItems } = parse(buildSheet({ header: '비고', rows: [{ category: '겉감', composition: 'A 100%' }] }));
    expect('composition' in bomItems[0]).toBe(false);
  });

  it('열이 있어도 전부 비어 있으면 기존 결과와 동일하다(필드 없음)', () => {
    const withCol = parse(buildSheet({ rows: [{ category: '겉감', composition: '' }, { category: '안감', composition: '' }] })).bomItems;
    const withoutCol = parse(buildSheet({ compositionHeaderAt: null, rows: [{ category: '겉감' }, { category: '안감' }] })).bomItems;
    expect(withCol).toEqual(withoutCol);
  });

  it('부자재 구분 행의 값도 그대로 읽는다(파서는 구분으로 걸러내지 않음)', () => {
    const { bomItems } = parse(buildSheet({ rows: [{ category: '단추', composition: 'ZINC 100%' }] }));
    expect(bomItems[0].composition).toBe('ZINC 100%');
  });
});
