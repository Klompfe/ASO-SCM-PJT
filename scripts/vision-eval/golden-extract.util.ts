import type * as XLSX from 'xlsx';
import type { GoldenStyle, GoldenColorQty, GoldenBomItem } from './types';

// PR-199: 정답(골든) MATERIAL LIST 엑셀에서 비교 대상 값을 읽는다 — 읽기 전용, 계산식
// 셀은 xlsx가 파일에 저장해 둔 캐시된 값(.v)만 읽는다(재계산 금지).
//
// 레이아웃 가정(실측 파일로 보정 필요 — 사용자가 --xlsx로 넘기는 실제 파일 컬럼이
// 다르면 COLOR_NAME_COLUMN 등을 조정한다):
//   B2  스타일번호
//   Z8  작성일, Z11 납기
//   5~10행: 색상명(COLOR_NAME_COLUMN 열) · C:E 사이즈별 수량 · I 합계
//   15행부터: A열에 라벨이 있는 행 = 품목 블록 시작(블록 높이 = 색상 수).
//             블록 첫 행 K열 = 요척(색상마다 다르면 블록 내 K값들을 모아 배열로),
//             L열 = 단위. "MAIN+SIZE" 라벨이 보이면 그 이후 블록은 라벨 구역(필수
//             소모품 존재 여부만 집계, 요척 비교 제외).
const COLOR_NAME_COLUMN = 'B';
const SIZE_COLUMNS = ['C', 'D', 'E'];
const TOTAL_COLUMN = 'I';
const COLOR_ROW_START = 5;
const COLOR_ROW_END = 10;
const BOM_ROW_START = 15;
const CONSUMPTION_COLUMN = 'K';
const UNIT_COLUMN = 'L';
const LABEL_ZONE_MARKER = 'MAIN+SIZE';
// 안전장치 — 품목 블록이 비정상적으로 안 끝나는 파일(빈 A열이 계속되는 등)에서도
// 무한루프 없이 멈춘다.
const MAX_BOM_ROWS_SCANNED = 500;

function cellValue(sheet: XLSX.WorkSheet, addr: string): unknown {
  return (sheet[addr] as XLSX.CellObject | undefined)?.v ?? null;
}

function extractColors(sheet: XLSX.WorkSheet): GoldenColorQty[] {
  const colors: GoldenColorQty[] = [];
  for (let row = COLOR_ROW_START; row <= COLOR_ROW_END; row++) {
    const colorName = cellValue(sheet, `${COLOR_NAME_COLUMN}${row}`);
    if (colorName == null || String(colorName).trim() === '') continue;
    const qtyBySize = SIZE_COLUMNS.map((col) => Number(cellValue(sheet, `${col}${row}`)) || 0);
    const total = Number(cellValue(sheet, `${TOTAL_COLUMN}${row}`)) || 0;
    colors.push({ color: String(colorName).trim(), qtyBySize, total });
  }
  return colors;
}

function extractBomItems(sheet: XLSX.WorkSheet, blockHeight: number): GoldenBomItem[] {
  const items: GoldenBomItem[] = [];
  let inLabelZone = false;
  let row = BOM_ROW_START;
  const lastRow = BOM_ROW_START + MAX_BOM_ROWS_SCANNED;

  while (row <= lastRow) {
    const label = cellValue(sheet, `A${row}`);
    if (label == null || String(label).trim() === '') {
      row += 1;
      continue;
    }
    const labelStr = String(label).trim();
    if (labelStr.includes(LABEL_ZONE_MARKER)) inLabelZone = true;

    const consumptionValues: number[] = [];
    for (let i = 0; i < blockHeight; i++) {
      const v = cellValue(sheet, `${CONSUMPTION_COLUMN}${row + i}`);
      if (v != null && v !== '') consumptionValues.push(Number(v));
    }
    const unit = cellValue(sheet, `${UNIT_COLUMN}${row}`);
    const distinct = [...new Set(consumptionValues)];

    items.push({
      itemName: labelStr,
      consumption: distinct.length <= 1 ? (distinct[0] ?? 0) : consumptionValues,
      unit: unit != null ? String(unit) : null,
      isLabelZone: inLabelZone,
    });

    row += blockHeight;
  }

  return items;
}

export function extractGoldenStyle(sheet: XLSX.WorkSheet, sheetName: string): GoldenStyle {
  const styleNoRaw = cellValue(sheet, 'B2');
  const documentDateRaw = cellValue(sheet, 'Z8');
  const targetRddRaw = cellValue(sheet, 'Z11');
  const colors = extractColors(sheet);
  const blockHeight = Math.max(1, colors.length);
  const bomItems = extractBomItems(sheet, blockHeight);
  const totalQty = colors.reduce((sum, c) => sum + c.total, 0);

  return {
    sheetName,
    styleNo: styleNoRaw != null ? String(styleNoRaw).trim() : null,
    documentDate: documentDateRaw != null ? String(documentDateRaw).trim() : null,
    targetRdd: targetRddRaw != null ? String(targetRddRaw).trim() : null,
    colors,
    totalQty,
    bomItems,
  };
}

export function extractGoldenFromWorkbook(wb: XLSX.WorkBook): GoldenStyle[] {
  return wb.SheetNames.map((name) => extractGoldenStyle(wb.Sheets[name], name));
}

export function findGoldenBySheetName(styles: GoldenStyle[], sheetName: string): GoldenStyle | null {
  return styles.find((s) => s.sheetName === sheetName) ?? null;
}
