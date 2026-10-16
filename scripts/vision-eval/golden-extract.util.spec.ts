import * as XLSX from 'xlsx';
import { extractGoldenStyle } from './golden-extract.util';

// 익명 합성 엑셀을 메모리에서 직접 만든다(실제 업무 파일 없이) — 셀 주소를 그대로
// 지정해 실제 MATERIAL LIST 레이아웃(B2/Z8/Z11, 5~10행 색상, 15행부터 품목 블록)을
// 재현한다.
function buildSheet(cells: Record<string, string | number>): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxRow = 0;
  let maxCol = 0;
  for (const [addr, value] of Object.entries(cells)) {
    const decoded = XLSX.utils.decode_cell(addr);
    maxRow = Math.max(maxRow, decoded.r);
    maxCol = Math.max(maxCol, decoded.c);
    ws[addr] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value };
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return ws;
}

describe('extractGoldenStyle (PR-199) — 익명 합성 엑셀', () => {
  it('스타일번호(B2)·작성일(Z8)·납기(Z11)를 읽는다', () => {
    const sheet = buildSheet({ B2: 'ANON-STYLE-1', Z8: '2026-07-01', Z11: '2/17' });
    const result = extractGoldenStyle(sheet, 'ANON-STYLE-1');
    expect(result.styleNo).toBe('ANON-STYLE-1');
    expect(result.documentDate).toBe('2026-07-01');
    expect(result.targetRdd).toBe('2/17');
  });

  it('색상 2개(블록 높이 2) × 품목 2개를 올바르게 묶는다(요척이 색상마다 같으면 단일 숫자)', () => {
    const sheet = buildSheet({
      B2: 'ANON-STYLE-2',
      // 색상 2개: BLACK/WHITE, 사이즈별 수량 C:E, 합계 I
      B5: 'BLACK', C5: 10, D5: 20, E5: 5, I5: 35,
      B6: 'WHITE', C6: 8, D6: 18, E6: 4, I6: 30,
      // 품목 블록 1: 15~16행(블록 높이=2), 요척 같음(1.5) → 단일 숫자
      A15: '원단A', K15: 1.5, L15: 'YD',
      A16: '', K16: 1.5,
      // 품목 블록 2: 17~18행, 요척 다름(색상별) → 배열
      A17: '원단B', K17: 2.0, L17: 'YD',
      A18: '', K18: 2.2,
    });
    const result = extractGoldenStyle(sheet, 'ANON-STYLE-2');
    expect(result.colors).toEqual([
      { color: 'BLACK', qtyBySize: [10, 20, 5], total: 35 },
      { color: 'WHITE', qtyBySize: [8, 18, 4], total: 30 },
    ]);
    expect(result.totalQty).toBe(65);
    expect(result.bomItems).toHaveLength(2);
    expect(result.bomItems[0]).toEqual({ itemName: '원단A', consumption: 1.5, unit: 'YD', isLabelZone: false });
    expect(result.bomItems[1]).toEqual({ itemName: '원단B', consumption: [2.0, 2.2], unit: 'YD', isLabelZone: false });
  });

  it('"MAIN+SIZE" 라벨이 나오면 그 이후 블록은 라벨 구역(isLabelZone=true)으로 분류한다', () => {
    const sheet = buildSheet({
      B2: 'ANON-STYLE-3',
      B5: 'BLACK', C5: 1, D5: 1, E5: 1, I5: 3,
      A15: '원단A', K15: 1.5, L15: 'YD',
      A16: 'MAIN+SIZE LABEL', K16: 0, L16: 'EA',
      A17: 'CARE LABEL', K17: 0, L17: 'EA',
    });
    const result = extractGoldenStyle(sheet, 'ANON-STYLE-3');
    expect(result.bomItems.find((i) => i.itemName === '원단A')?.isLabelZone).toBe(false);
    expect(result.bomItems.find((i) => i.itemName.includes('MAIN+SIZE'))?.isLabelZone).toBe(true);
    expect(result.bomItems.find((i) => i.itemName === 'CARE LABEL')?.isLabelZone).toBe(true);
  });

  it('값이 없는 셀은 null/빈 배열로 안전하게 처리한다', () => {
    const sheet = buildSheet({ B2: 'ANON-STYLE-4' });
    const result = extractGoldenStyle(sheet, 'ANON-STYLE-4');
    expect(result.documentDate).toBeNull();
    expect(result.targetRdd).toBeNull();
    expect(result.colors).toEqual([]);
    expect(result.bomItems).toEqual([]);
    expect(result.totalQty).toBe(0);
  });
});
