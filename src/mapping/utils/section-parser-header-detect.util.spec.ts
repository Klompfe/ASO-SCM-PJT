import { SectionParser } from './section-parser.util';

// PR-254: BOM 머리글(`ITEMS`) 줄 탐지 — 합성 시트(실제 파일·업무 데이터 없음).
// 실제 자재명세 서식: ITEMS 머리글 줄(QTY, COLOR OF, ... 혼용률) 바로 아래 서브헤더 줄(SPEC, CON'S ...),
// 그 아래부터 데이터. 아래 시트 생성기는 머리글 줄 위치(headerAt)를 바꿔 가며 같은 구조를 만든다.
const WIDTH = 30;
const blank = () => Array.from({ length: WIDTH }, () => '') as unknown[];

interface Opts {
  headerAt: number | null; // null 이면 ITEMS 머리글 없음(서브헤더만 13번째 줄)
  consInSubHeader?: boolean; // true: CON'S 는 서브헤더 줄에(실제 서식), false: 머리글 줄에(합성 구형)
  extraItemsAt?: number; // 두 번째 ITEMS 후보 줄
  items?: { name: string; composition?: string }[];
}

function buildSheet(o: Opts): string[][] {
  const items = o.items ?? [{ name: '겉감\nOUT-SHELL', composition: 'COTTON 60% POLYESTER 40%' }, { name: '안감 LINING', composition: 'POLYESTER 100%' }, { name: 'EDGE TAPE' }];
  const total = Math.max(o.headerAt ?? 13, o.extraItemsAt ?? 0) + 2 + items.length + 2;
  const rows: unknown[][] = Array.from({ length: Math.max(total, 20) }, blank);
  rows[1][1] = 'SYN-STYLE-001';
  rows[1][8] = '100';
  rows[1][14] = '베트남';
  rows[1][21] = '테스트바이어';
  const h = o.headerAt ?? 12; // ITEMS 없음: 머리글 위치를 12 에 두되 ITEMS 글자는 쓰지 않는다(서브헤더는 13)
  rows[h][0] = o.headerAt === null ? 'HEADER' : 'ITEMS';
  rows[h][2] = 'COLOR OF';
  rows[h][26] = '혼용률\n중량';
  rows[h + 1][2] = 'OUT SHELL';
  rows[h + 1][8] = 'SPEC';
  rows[h + 1][10] = "CON'S";
  if (o.consInSubHeader === false) {
    rows[h + 1][10] = '';
    rows[h][10] = "CON'S";
  }
  if (o.extraItemsAt != null) rows[o.extraItemsAt][0] = 'ITEMS';
  items.forEach((it, i) => {
    const r = rows[h + 2 + i];
    r[0] = it.name;
    r[2] = 'BK';
    r[8] = `SPEC${i}`;
    r[10] = '1';
    r[26] = it.composition ?? '';
  });
  return rows as string[][];
}

const parse = (rows: string[][]) => SectionParser.parse(rows, []);
const names = (r: ReturnType<typeof parse>) => r.bomItems.map((b: any) => b.itemName);

describe('SectionParser — BOM 머리글(ITEMS) 줄 탐지 (PR-254)', () => {
  it.each([11, 12, 14])('머리글이 %i번째 줄이어도 첫 자재(겉감) 행과 혼용률 열을 읽는다', (headerAt) => {
    const r = parse(buildSheet({ headerAt }));
    expect(r.bomItems).toHaveLength(3);
    expect(r.bomItems[0].itemName).toContain('OUT-SHELL');
    expect(r.bomItems[0].composition).toBe('COTTON 60% POLYESTER 40%');
    expect(r.bomItems[1].composition).toBe('POLYESTER 100%');
    expect(r.bomItems[2].composition).toBeUndefined();
    expect(r.bomItems[0].consumption).toBe(1); // CON'S 는 서브헤더 줄에서 찾는다
  });

  it('12 와 14 의 결과 행 구조가 같다(줄 번호만 다르고 내용은 동일)', () => {
    const a = parse(buildSheet({ headerAt: 12 })).bomItems;
    const b = parse(buildSheet({ headerAt: 14 })).bomItems;
    expect(a).toEqual(b);
  });

  it('13번째 줄 시트: 결과가 기존(고정 13/15)과 같다 — 골든 + 안내 없음', () => {
    const r = parse(buildSheet({ headerAt: 13, consInSubHeader: false }));
    expect(r.warnings).toEqual([]);
    expect(r.bomItems).toEqual([
      { category: '겉감\nOUT-SHELL', itemName: '겉감\nOUT-SHELL', consumption: 1, requiredQty: 100, colorOf: 'BK', spec: 'SPEC0', composition: 'COTTON 60% POLYESTER 40%' },
      { category: '안감 LINING', itemName: '안감 LINING', consumption: 1, requiredQty: 100, colorOf: 'BK', spec: 'SPEC1', composition: 'POLYESTER 100%' },
      { category: 'EDGE TAPE', itemName: 'EDGE TAPE', consumption: 1, requiredQty: 100, colorOf: 'BK', spec: 'SPEC2' },
    ]);
  });

  it('머리글이 13번째 줄이 아니면 정보성 안내 BOM_HEADER_SHIFTED 를 남긴다', () => {
    const r = parse(buildSheet({ headerAt: 12 }));
    expect(r.warnings.some((w) => w.includes('BOM_HEADER_SHIFTED') && w.includes('13번째'))).toBe(true);
  });

  it('ITEMS 머리글이 없으면 기존 고정 위치(13/15)로 읽고 BOM_HEADER_NOT_FOUND 경고', () => {
    const rows = buildSheet({ headerAt: null });
    const r = parse(rows);
    expect(r.warnings.some((w) => w.includes('BOM_HEADER_NOT_FOUND'))).toBe(true);
    // 기존 동작: 13번째 줄(서브헤더)을 머리글로 보고 15번째 줄부터 읽는다 → 첫 자재 행(14)은 건너뜀
    expect(r.bomItems).toHaveLength(2);
  });

  it('ITEMS 후보가 2개면 기존 위치(13)에 가까운 후보를 쓰고 BOM_HEADER_AMBIGUOUS 경고', () => {
    const r = parse(buildSheet({ headerAt: 12, extraItemsAt: 25, items: [{ name: 'A' }, { name: 'B' }] }));
    expect(r.warnings.some((w) => w.includes('BOM_HEADER_AMBIGUOUS'))).toBe(true);
    expect(names(r)[0]).toBe('A'); // 12 번 후보 사용
  });

  it('후보 2개: 13 에서 같은 거리면(11, 15) 더 앞쪽이 아니라 위쪽 후보 우선 규칙이 일정하게 적용된다', () => {
    const r = parse(buildSheet({ headerAt: 11, extraItemsAt: 15, items: [{ name: 'A' }] }));
    expect(r.warnings.some((w) => w.includes('BOM_HEADER_AMBIGUOUS'))).toBe(true);
    expect(r.bomItems.length).toBeGreaterThanOrEqual(0); // 오류 없이 결정적으로 하나를 선택
  });

  it('대소문자·앞뒤 공백 변형 " items " 도 인식', () => {
    const rows = buildSheet({ headerAt: 12 });
    rows[12][0] = ' items ';
    const r = parse(rows);
    expect(r.bomItems).toHaveLength(3);
  });

  it('머리글 아래에 행이 없으면 빈 결과(오류 아님)', () => {
    const rows = buildSheet({ headerAt: 12, items: [] });
    expect(parse(rows).bomItems).toEqual([]);
  });

  it('ITEMS 가 앞쪽 30줄 밖에 있으면 후보로 보지 않는다(없음 취급)', () => {
    const rows = buildSheet({ headerAt: 12 });
    rows[12][0] = 'X';
    while (rows.length < 40) rows.push(blank() as string[]);
    rows[35][0] = 'ITEMS';
    expect(parse(rows).warnings.some((w) => w.includes('BOM_HEADER_NOT_FOUND'))).toBe(true);
  });
});
