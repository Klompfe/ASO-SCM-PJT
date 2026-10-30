// PR-212: MATERIAL LIST 업로드 미리보기(MappingPreviewModal)에서 색상×사이즈 수량을
// 행=색상, 열=사이즈 표로 보여주기 위한 순수 피벗 함수. 서버(parseStyleColorSizeQuantities)
// 응답의 rows(이미 국내만, 0/빈 칸 제외된 값)를 그대로 받아 UI가 바로 그릴 수 있는 모양으로
// 바꾼다 — 집계는 서버가 하지 않으므로(합계 셀은 시트에서 읽지 않는다는 설계) 여기서 직접 더한다.
export interface StyleColorSizeQtyRow {
  color: string;
  size: string;
  qty: number;
}

export interface ColorSizeQuantityTable {
  sizes: string[];
  colors: string[];
  cellQty: (color: string, size: string) => number | null;
  totalByColor: Record<string, number>;
  totalBySize: Record<string, number>;
  grandTotal: number;
}

export function buildColorSizeQuantityTable(rows: StyleColorSizeQtyRow[]): ColorSizeQuantityTable {
  const sizes: string[] = [];
  const colors: string[] = [];
  const cellMap = new Map<string, number>();
  const totalByColor: Record<string, number> = {};
  const totalBySize: Record<string, number> = {};
  let grandTotal = 0;

  for (const r of rows) {
    if (!sizes.includes(r.size)) sizes.push(r.size);
    if (!colors.includes(r.color)) colors.push(r.color);
    cellMap.set(`${r.color}\u0000${r.size}`, r.qty);
    totalByColor[r.color] = (totalByColor[r.color] ?? 0) + r.qty;
    totalBySize[r.size] = (totalBySize[r.size] ?? 0) + r.qty;
    grandTotal += r.qty;
  }

  return {
    sizes,
    colors,
    cellQty: (color, size) => cellMap.get(`${color}\u0000${size}`) ?? null,
    totalByColor,
    totalBySize,
    grandTotal,
  };
}
