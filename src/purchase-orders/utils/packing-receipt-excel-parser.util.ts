import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-074: 공급사가 보내오는 포장명세서 양식은 다양하지만(실제 첨부 파일 기준 13개
// 시트 양식이 확인됨), 이번 PR에서는 그중 두 가지만 지원한다 —
//   1) 원단(롤 단위): BEANPOLE_TTL형 — NO/SHIPPING DT./STYLE NO./COLOR/WIDTH(CM,INC)/
//      R.N/GROSS/NET/WEIGHT/WT.MT/THICKNESS/THICKNESS.MT 헤더.
//   2) 부자재(카톤 단위): MATERIAL PACKING LIST형 — CT/No./Style No./Color/Size/R.NO/
//      LOT/Q'ty/Item/Kg 헤더.
// 헤더 위치는 시트마다 다를 수 있어(설명 텍스트 행 유무 등) 절대 행 번호가 아니라
// 정규화한 헤더 텍스트로 헤더 행 자체를 찾는다. 시트 이름은 검사하지 않는다 — 같은
// 양식이 다른 이름의 탭에 들어있을 수 있기 때문에 헤더 시그니처로만 판별한다.
// 지원하지 않는 양식이면(헤더를 못 찾으면) 조용히 잘못 파싱하지 않고 명확한
// BadRequestException으로 직접입력을 안내한다.

export interface ParsedRollRow {
  rollNo: string;
  color: string | null;
  widthCm: number | null;
  widthInch: number | null;
  grossWeight: number | null;
  netWeight: number | null;
  thickness: number | null;
}

export interface ParsedCartonRow {
  cartonNo: string;
  color: string | null;
  size: string | null;
  lotNo: string | null;
  qty: number;
  itemName: string | null;
  weightKg: number | null;
}

type RawRow = Array<string | number>;

const normalize = (v: unknown): string =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toUpperCase();

function readAllSheets(buffer: Buffer): { sheetName: string; rows: RawRow[] }[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
    }) as RawRow[],
  }));
}

function findHeaderRow(rows: RawRow[], requiredNormalizedHeaders: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const normalized = rows[i].map(normalize);
    if (requiredNormalizedHeaders.every((h) => normalized.includes(h))) {
      return i;
    }
  }
  return -1;
}

function colIndex(headerRow: RawRow, target: string): number {
  return headerRow.map(normalize).indexOf(target);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStringOrNull(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  return String(v);
}

export class PackingReceiptExcelParser {
  static parseFabricRolls(buffer: Buffer): ParsedRollRow[] {
    const sheets = readAllSheets(buffer);
    for (const { rows } of sheets) {
      const headerIdx = findHeaderRow(rows, ['RN', 'GROSS', 'NET', 'THICKNESS']);
      if (headerIdx === -1) continue;
      return this.extractRolls(rows, headerIdx);
    }
    throw new BadRequestException(
      '인식 가능한 원단 포장내역(롤 단위) 양식을 찾지 못했습니다. ' +
        '지원 양식: BEANPOLE_TTL형(COLOR/WIDTH/R.N/GROSS/NET/THICKNESS 헤더). ' +
        '이 양식이 아니라면 직접입력을 이용해 주세요.',
    );
  }

  static parseTrimCartons(buffer: Buffer): ParsedCartonRow[] {
    const sheets = readAllSheets(buffer);
    for (const { rows } of sheets) {
      // CTNO/STYLENO/QTY만으로는 다른 공급사 포장리스트(예: ZIPPER_DANAM — "C/T NO",
      // "STYLE NO.", "Q'TY" 헤더를 그대로 가진 별개 양식, 이번 PR 범위 밖)와 헤더가
      // 겹쳐 오탐한다(실제 원본 파일로 확인됨) — SIZE/LOT까지 함께 요구해 MATERIAL
      // PACKING LIST 고유 양식만 매칭하도록 좁힌다.
      const headerIdx = findHeaderRow(rows, ['CTNO', 'STYLENO', 'QTY', 'SIZE', 'LOT']);
      if (headerIdx === -1) continue;
      return this.extractCartons(rows, headerIdx);
    }
    throw new BadRequestException(
      '인식 가능한 부자재 포장내역(카톤 단위) 양식을 찾지 못했습니다. ' +
        "지원 양식: MATERIAL PACKING LIST형(CT/No., Style No., Q'ty, Item 헤더). " +
        '이 양식이 아니라면 직접입력을 이용해 주세요.',
    );
  }

  private static extractRolls(rows: RawRow[], headerIdx: number): ParsedRollRow[] {
    const header = rows[headerIdx];
    const rIdx = colIndex(header, 'RN');
    const colorIdx = colIndex(header, 'COLOR');
    const cmIdx = colIndex(header, 'CM');
    const incIdx = colIndex(header, 'INC');
    const grossIdx = colIndex(header, 'GROSS');
    const netIdx = colIndex(header, 'NET');
    const thicknessIdx = colIndex(header, 'THICKNESS');

    let lastColor: unknown = null;
    let lastCm: unknown = null;
    let lastInc: unknown = null;
    const result: ParsedRollRow[] = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rNRaw = row[rIdx];
      // R/N(롤 번호) 칸이 숫자가 아니면 "소계"/"품번별합계" 요약 행이거나 완전히 빈
      // 행이다 — 실제 롤 데이터가 아니므로 건너뛴다(요약 행을 롤로 오인하지 않도록).
      if (typeof rNRaw !== 'number') continue;

      if (row[colorIdx] !== '' && row[colorIdx] != null) lastColor = row[colorIdx];
      if (row[cmIdx] !== '' && row[cmIdx] != null) lastCm = row[cmIdx];
      if (row[incIdx] !== '' && row[incIdx] != null) lastInc = row[incIdx];

      result.push({
        rollNo: String(rNRaw),
        color: toStringOrNull(lastColor),
        widthCm: toNumberOrNull(lastCm),
        widthInch: toNumberOrNull(lastInc),
        grossWeight: toNumberOrNull(row[grossIdx]),
        netWeight: toNumberOrNull(row[netIdx]),
        thickness: toNumberOrNull(row[thicknessIdx]),
      });
    }

    if (result.length === 0) {
      throw new BadRequestException(
        '원단 포장내역 헤더는 찾았지만 유효한 롤 데이터 행이 없습니다. 파일 내용을 확인해 주세요.',
      );
    }
    return result;
  }

  private static extractCartons(rows: RawRow[], headerIdx: number): ParsedCartonRow[] {
    const header = rows[headerIdx];
    const ctIdx = colIndex(header, 'CTNO');
    const colorIdx = colIndex(header, 'COLOR');
    const sizeIdx = colIndex(header, 'SIZE');
    const lotIdx = colIndex(header, 'LOT');
    const qtyIdx = colIndex(header, 'QTY');
    const itemIdx = colIndex(header, 'ITEM');
    const kgIdx = colIndex(header, 'KG');

    let lastCartonNo: unknown = null;
    const result: ParsedCartonRow[] = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      // CT/No.(카톤 번호)는 같은 카톤에 여러 품목 라인이 이어질 때 첫 줄에만 적히고
      // 나머지는 병합된 것처럼 빈칸으로 남는 실무 양식이라 forward-fill한다.
      if (row[ctIdx] !== '' && row[ctIdx] != null) lastCartonNo = row[ctIdx];

      const qtyRaw = row[qtyIdx];
      const isBlankRow = (qtyRaw === '' || qtyRaw == null) && !row[colorIdx] && !row[itemIdx];
      if (isBlankRow) continue;
      if (lastCartonNo == null) continue; // 카톤 번호를 알 수 없는 데이터는 신뢰할 수 없어 건너뛴다.

      result.push({
        cartonNo: String(lastCartonNo),
        color: toStringOrNull(row[colorIdx]),
        size: toStringOrNull(row[sizeIdx]),
        lotNo: toStringOrNull(row[lotIdx]),
        qty: toNumberOrNull(qtyRaw) ?? 0,
        itemName: toStringOrNull(row[itemIdx]),
        weightKg: toNumberOrNull(row[kgIdx]),
      });
    }

    if (result.length === 0) {
      throw new BadRequestException(
        '부자재 포장내역 헤더는 찾았지만 유효한 카톤 데이터 행이 없습니다. 파일 내용을 확인해 주세요.',
      );
    }
    return result;
  }
}
