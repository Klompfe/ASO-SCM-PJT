import { parseStyleColorSizeQuantities } from './style-color-size-quantity-parser.util';

// PR-212: 합성(코드로 생성한) 시트만 쓴다 — 실제 업무 엑셀/수량 데이터는 저장소에 넣지 않는다.
// 실측 레이아웃(118개 시트 전수조사)을 그대로 본뜬 최소 뼈대: row0=제목, row1=헤더(QTY 등),
// row3=CLOOR/SIZE(사이즈는 col2부터), row4~6=국내 3행(H열=col7에 '국내'), row7~9=중국 3행
// (H열에 '중국'), row10=EACH SIZE TOTAL.
function buildRows(opts: {
  headerRowIndex?: number;
  sizes?: string[];
  domesticRows?: (string | number | null)[][]; // 각 행: [color, ...qtyPerSize]
  chinaRows?: (string | number | null)[][];
}): string[][] {
  const headerRowIndex = opts.headerRowIndex ?? 3;
  const sizes = opts.sizes ?? ['55', '66', '77'];
  const rows: string[][] = [];
  for (let i = 0; i < headerRowIndex; i++) rows.push([]);

  const headerRow: string[] = ['CLOOR/SIZE', ''];
  sizes.forEach((s) => headerRow.push(s));
  headerRow.push('TOTAL');
  rows.push(headerRow as any);

  const fillBlock = (blockRows: (string | number | null)[][] | undefined, label: string) => {
    for (let i = 0; i < 3; i++) {
      const src = blockRows?.[i];
      const row: any[] = new Array(8).fill(null);
      if (src) {
        row[0] = src[0];
        sizes.forEach((_, idx) => { row[2 + idx] = src[1 + idx] ?? null; });
      }
      if (i === 0) row[7] = label;
      rows.push(row);
    }
  };
  fillBlock(opts.domesticRows, '국내');
  fillBlock(opts.chinaRows, '중국');
  rows.push(['EACH SIZE TOTAL']);
  return rows as any;
}

describe('parseStyleColorSizeQuantities (PR-212)', () => {
  it('국내 1색 — 사이즈별 수량을 그대로 저장한다', () => {
    const rows = buildRows({ domesticRows: [['NA', 320, 300, 80]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows).toEqual([
      { color: 'NA', size: '55', qty: 320 },
      { color: 'NA', size: '66', qty: 300 },
      { color: 'NA', size: '77', qty: 80 },
    ]);
    expect(result.quantitySum).toBe(700);
    expect(result.warnings).toEqual([]);
  });

  it('국내 2색 — 색상별로 각각 저장한다', () => {
    const rows = buildRows({ domesticRows: [['BK', 260, 250, 66], ['BE', 240, 230, 52]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.filter((r) => r.color === 'BK').map((r) => r.qty)).toEqual([260, 250, 66]);
    expect(result.rows.filter((r) => r.color === 'BE').map((r) => r.qty)).toEqual([240, 230, 52]);
  });

  it('국내 3색 — 전부 저장한다', () => {
    const rows = buildRows({ domesticRows: [['BE', 240, 230, 54], ['GR', 270, 250, 65], ['BK', 260, 250, 59]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(new Set(result.rows.map((r) => r.color))).toEqual(new Set(['BE', 'GR', 'BK']));
  });

  it('사이즈 2칸(0/1)', () => {
    const rows = buildRows({ sizes: ['0', '1'], domesticRows: [['BK', 107, 102]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.map((r) => r.size)).toEqual(['0', '1']);
  });

  it('사이즈 4칸(FREE 포함)', () => {
    const rows = buildRows({ sizes: ['S', 'M', 'L', 'FREE'], domesticRows: [['BK', 10, 20, 30, 40]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.map((r) => r.size)).toEqual(['S', 'M', 'L', 'FREE']);
    expect(result.quantitySum).toBe(100);
  });

  it('헤더 행이 한 행 아래로 밀려도(하드코딩 금지 확인) 정상 파싱한다', () => {
    const rows = buildRows({ headerRowIndex: 4, domesticRows: [['BK', 100, 200, 50]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.quantitySum).toBe(350);
  });

  it('집계 셀(EACH SIZE TOTAL/TOTAL 열)은 절대 읽지 않는다 — 비어 있어도 정상 동작', () => {
    const rows = buildRows({ domesticRows: [['NA', 320, 300, 80]] });
    // TOTAL 열(col8)과 EACH SIZE TOTAL 행이 전부 비어 있는 상태 그대로(buildRows 기본값) 확인.
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.quantitySum).toBe(700);
  });

  it('중국 행에 0이 아닌 값이 있으면 저장하지 않고 경고를 1회만 낸다', () => {
    const rows = buildRows({
      domesticRows: [['NA', 320, 300, 80]],
      chinaRows: [['NA', 10, 20, 0]],
    });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.every((r) => r.qty !== 10 && r.qty !== 20)).toBe(true);
    expect(result.warnings.filter((w) => w.includes('QTY_CHINA_IGNORED'))).toHaveLength(1);
  });

  it('중국 행이 전부 0/빈 칸이면 경고를 내지 않는다', () => {
    const rows = buildRows({ domesticRows: [['NA', 320, 300, 80]], chinaRows: [['NA', 0, null, 0]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.warnings.filter((w) => w.includes('QTY_CHINA_IGNORED'))).toHaveLength(0);
  });

  it('소수 셀은 저장하지 않고 경고(QTY_CELL_INVALID)', () => {
    const rows = buildRows({ domesticRows: [['BK', 1.5, 300, 80]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.some((r) => r.size === '55')).toBe(false);
    expect(result.warnings.some((w) => w.includes('QTY_CELL_INVALID'))).toBe(true);
  });

  it('음수 셀은 저장하지 않고 경고', () => {
    const rows = buildRows({ domesticRows: [['BK', -5, 300, 80]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.some((r) => r.size === '55')).toBe(false);
    expect(result.warnings.some((w) => w.includes('QTY_CELL_INVALID'))).toBe(true);
  });

  it('문자 셀은 저장하지 않고 경고', () => {
    const rows = buildRows({ domesticRows: [['BK', 'abc', 300, 80]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.some((r) => r.size === '55')).toBe(false);
    expect(result.warnings.some((w) => w.includes('QTY_CELL_INVALID'))).toBe(true);
  });

  it('색상이 빈 칸인데 수량이 있으면 NA로 저장하고 경고', () => {
    const rows = buildRows({ domesticRows: [[null, 100, 200, 50]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.every((r) => r.color === 'NA')).toBe(true);
    expect(result.warnings.some((w) => w.includes('QTY_COLOR_BLANK'))).toBe(true);
  });

  it('같은 색상명이 두 번 나오면 합산하지 않고 먼저 나온 행만 저장, 경고', () => {
    const rows = buildRows({ domesticRows: [['BK', 100, 200, 50], ['BK', 999, 999, 999]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.filter((r) => r.color === 'BK').map((r) => r.qty)).toEqual([100, 200, 50]);
    expect(result.warnings.some((w) => w.includes('QTY_COLOR_DUPLICATE'))).toBe(true);
  });

  it('수량 블록이 없는 시트는 빈 결과 + info만(실패하지 않음)', () => {
    const rows: string[][] = [['MATERIAL LIST'], ['STYLE NO', 'MB00TEST']];
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows).toEqual([]);
    expect(result.info).toContain('CLOOR/SIZE');
  });

  it('단색(NA)도 정상 저장된다', () => {
    const rows = buildRows({ domesticRows: [['NA', 410, 380, 158]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows.map((r) => r.color)).toEqual(['NA', 'NA', 'NA']);
  });

  it('0과 빈 칸은 조용히 저장하지 않는다(경고 없음)', () => {
    const rows = buildRows({ domesticRows: [['BK', 0, null, 80]] });
    const result = parseStyleColorSizeQuantities(rows);
    expect(result.rows).toEqual([{ color: 'BK', size: '77', qty: 80 }]);
    expect(result.warnings).toEqual([]);
  });
});
