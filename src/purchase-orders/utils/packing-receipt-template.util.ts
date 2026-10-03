import * as xlsx from 'xlsx';
import { BadRequestException } from '@nestjs/common';

// PR-169: 공급업체 포장내역 표준양식 — 발주 생성 시 자동으로 상단 컨텍스트(발주/스타일/
// 자재 정보)를 채워 다운로드하고, 공급업체가 하단 실측 표를 채워 다시 업로드하면 그대로
// 파싱해 PackingReceiptRoll[]/PackingReceiptCarton[]로 되돌린다. 생성(generate)과
// 파싱(parse)이 서로 다른 소스(프론트/백엔드)에서 각자 포맷을 베껴 적으면 쉽게 어긋나므로,
// 이 파일 하나에 포맷(시그니처 문자열, 헤더 텍스트, 예시행 마커)을 전부 모아 generate가
// 쓴 그대로 parse가 읽게 한다 — 그래서 다운로드도 (프론트가 아니라) 이 백엔드가 만든다.
//
// 기존 BEANPOLE_TTL형/MATERIAL PACKING LIST형 파서(packing-receipt-excel-parser.util.ts)와
// 달리, 헤더 텍스트가 우리가 직접 정한 값이라 느슨한 정규화 매칭이 필요 없다 — 정확히
// 일치하는지만 본다. 시그니처 행이 없으면 양식 자체가 다른 것이므로 바로 거부한다.

export const PACKING_RECEIPT_TEMPLATE_SIGNATURE = 'ASO-SCM 포장내역 표준양식 v1';
export const EXAMPLE_ROW_MARKER = '예시 행 — 실제 값으로 교체';
export const SUMMARY_ROW_LABEL = 'CBM';

const FABRIC_HEADERS = ['No.', 'Roll No.', 'Color', 'Width(cm)', 'Width(inch)', 'Gross Weight(kg)', 'Net Weight(kg)', 'Thickness', 'Length(YD)', 'Remark'];
const TRIM_HEADERS = ['No.', 'Carton No.', 'Color', 'Size', 'Lot No.', 'Qty', 'Item Name', 'Weight(kg)', 'Remark'];
const BLANK_DATA_ROWS = 30;

export interface MidoPriceCandidateSummary {
  itemName: string;
  priceUsdMin: number;
  priceUsdMax: number;
  unit: string;
}

export interface PackingReceiptTemplateContext {
  purchaseOrderId: number;
  styleNo: string | null;
  brand: string | null;
  buyer: string | null;
  factory: string | null;
  supplierName: string | null;
  orderedDate: string | null;
  targetRdd: string | null;
  itemName: string | null;
  itemEnglishName: string | null;
  composition: string | null;
  hsCode: string | null;
  unitPrice: number | null;
  quantity: number;
  midoPriceCandidates: MidoPriceCandidateSummary[];
}

export interface ParsedTemplateRoll {
  rollNo: string;
  color: string | null;
  widthCm: number | null;
  widthInch: number | null;
  grossWeight: number | null;
  netWeight: number | null;
  thickness: number | null;
  lengthYd: number | null;
}

export interface ParsedTemplateCarton {
  cartonNo: string;
  color: string | null;
  size: string | null;
  lotNo: string | null;
  qty: number;
  itemName: string | null;
  weightKg: number | null;
}

export interface ParsedTemplateResult {
  cbm: number | null;
  packageType: string | null;
  declaredPackageCount: number | null;
  rolls: ParsedTemplateRoll[];
  cartons: ParsedTemplateCarton[];
  warnings: string[];
}

type RawRow = Array<string | number>;

function contextRows(ctx: PackingReceiptTemplateContext): [string, string | number][] {
  const rows: [string, string | number][] = [
    ['PO No.', `#${ctx.purchaseOrderId}`],
    ['스타일번호', ctx.styleNo ?? ''],
    ['브랜드', ctx.brand ?? ''],
    ['바이어', ctx.buyer ?? ''],
    ['생산처', ctx.factory ?? ''],
    ['공급업체명', ctx.supplierName ?? ''],
    ['발주일자', ctx.orderedDate ?? ''],
    ['납기일(RDD)', ctx.targetRdd ?? ''],
    ['자재명', ctx.itemName ?? ''],
    ['자재영문명', ctx.itemEnglishName ?? ''],
    ['혼용률', ctx.composition ?? ''],
    ['HS코드', ctx.hsCode ?? ''],
    ['발주단가(KRW)', ctx.unitPrice ?? ''],
    ['발주수량(참고용)', ctx.quantity],
  ];
  // 발주단가가 없는 자재는 미도 단가표에서 느슨하게 일치하는 후보들을 참고용으로 함께
  // 보여준다(mido-price-table.service.ts와 동일한 원칙 — 자동으로 하나를 확정하지 않고
  // 후보를 전부 보여줘 사람이 참고하게 한다).
  if (ctx.unitPrice == null && ctx.midoPriceCandidates.length > 0) {
    rows.push([
      '미도단가표 후보(참고, USD — 자동확정 아님)',
      ctx.midoPriceCandidates.map((c) => `${c.itemName}: $${c.priceUsdMin}~$${c.priceUsdMax}/${c.unit}`).join(' | '),
    ]);
  }
  return rows;
}

function exampleRow(headers: string[], isFabric: boolean): RawRow {
  if (isFabric) {
    return ['1', 'R-001', 'BLACK', 150, 59.06, 83, 80, 22.7, 143, EXAMPLE_ROW_MARKER];
  }
  return ['1', 'T.I-1', 'BLACK', 'FREE', 'LOT-001', 100, '메인라벨', 10.2, EXAMPLE_ROW_MARKER];
}

export function buildPackingReceiptTemplateSheetData(
  ctx: PackingReceiptTemplateContext,
  materialCategory: 'FABRIC' | 'TRIM',
): RawRow[] {
  const isFabric = materialCategory === 'FABRIC';
  const headers = isFabric ? FABRIC_HEADERS : TRIM_HEADERS;

  const rows: RawRow[] = [
    [PACKING_RECEIPT_TEMPLATE_SIGNATURE],
    [`자재구분: ${isFabric ? '원단(FABRIC)' : '부자재(TRIM)'}`],
    [],
    ...contextRows(ctx),
    [],
    headers,
    exampleRow(headers, isFabric),
  ];

  for (let i = 0; i < BLANK_DATA_ROWS; i++) {
    rows.push([String(i + 2)]);
  }

  rows.push([]);
  rows.push(['CBM/포장수/포장형태 — 공급업체가 아래 요약을 채워주세요']);
  rows.push([SUMMARY_ROW_LABEL, '', '포장수', '', '포장형태', '']);

  return rows;
}

export function buildPackingReceiptTemplateBuffer(
  ctx: PackingReceiptTemplateContext,
  materialCategory: 'FABRIC' | 'TRIM',
): Buffer {
  const data = buildPackingReceiptTemplateSheetData(ctx, materialCategory);
  const sheet = xlsx.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
  const workbook = xlsx.utils.book_new();
  const sheetName = materialCategory === 'FABRIC' ? '원단포장내역' : '부자재포장내역';
  xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function readFirstSheetRows(buffer: Buffer): RawRow[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as RawRow[];
    if (String(rows[0]?.[0] ?? '').trim() === PACKING_RECEIPT_TEMPLATE_SIGNATURE) {
      return rows;
    }
  }
  throw new BadRequestException(
    `표준양식(${PACKING_RECEIPT_TEMPLATE_SIGNATURE})이 아닙니다. 발주 상세 화면에서 내려받은 양식을 그대로 사용해 주세요.`,
  );
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

function findContextValue(rows: RawRow[], label: string): string | null {
  for (const row of rows) {
    if (String(row[0] ?? '').trim() === label) {
      return toStringOrNull(row[1]);
    }
  }
  return null;
}

function findHeaderRowIndex(rows: RawRow[], headers: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (headers.every((h, idx) => String(row[idx] ?? '').trim() === h)) {
      return i;
    }
  }
  return -1;
}

function findSummaryRow(rows: RawRow[], fromIdx: number): RawRow | null {
  for (let i = fromIdx; i < rows.length; i++) {
    if (String(rows[i]?.[0] ?? '').trim() === SUMMARY_ROW_LABEL) {
      return rows[i];
    }
  }
  return null;
}

// 업로드된 양식의 상단 컨텍스트(PO No./스타일번호)가 실제 발주 정보와 다르면 저장을
// 막아야 한다(안전모드) — 호출자(서비스)가 DB에서 조회한 기대값을 넘겨주고, 이 함수는
// 그 값과 시트에 적힌 값을 대조만 한다(DB 접근은 이 유틸의 책임이 아니다).
export function parsePackingReceiptTemplate(
  buffer: Buffer,
  materialCategory: 'FABRIC' | 'TRIM',
  expected: { purchaseOrderId: number; styleNo: string | null },
): ParsedTemplateResult {
  const rows = readFirstSheetRows(buffer);
  const warnings: string[] = [];

  const poNoInSheet = findContextValue(rows, 'PO No.');
  const expectedPoNo = `#${expected.purchaseOrderId}`;
  if (poNoInSheet !== expectedPoNo) {
    throw new BadRequestException(
      `양식 상단의 PO No.(${poNoInSheet ?? '(없음)'})가 이 발주(${expectedPoNo})와 일치하지 않습니다. 다른 발주의 양식을 올렸을 수 있습니다.`,
    );
  }

  const styleNoInSheet = findContextValue(rows, '스타일번호');
  if ((expected.styleNo ?? null) !== (styleNoInSheet || null)) {
    throw new BadRequestException(
      `양식 상단의 스타일번호(${styleNoInSheet ?? '(없음)'})가 이 발주의 실제 스타일번호(${expected.styleNo ?? '(없음)'})와 일치하지 않습니다. 양식이 수정되었거나 잘못된 파일일 수 있습니다.`,
    );
  }

  const isFabric = materialCategory === 'FABRIC';
  const headers = isFabric ? FABRIC_HEADERS : TRIM_HEADERS;
  const headerIdx = findHeaderRowIndex(rows, headers);
  if (headerIdx === -1) {
    throw new BadRequestException(
      `${isFabric ? '원단' : '부자재'} 포장내역 표의 헤더를 찾지 못했습니다. 양식의 표 구조를 변경하지 말아 주세요.`,
    );
  }

  const summaryRow = findSummaryRow(rows, headerIdx + 1);
  const summaryIdx = summaryRow ? rows.indexOf(summaryRow, headerIdx + 1) : rows.length;

  const rolls: ParsedTemplateRoll[] = [];
  const cartons: ParsedTemplateCarton[] = [];

  for (let i = headerIdx + 1; i < summaryIdx; i++) {
    const row = rows[i];
    if (!row) continue;
    const remark = isFabric ? row[9] : row[8];
    if (String(remark ?? '').trim() === EXAMPLE_ROW_MARKER) continue;

    if (isFabric) {
      const rollNo = toStringOrNull(row[1]);
      const hasAnyData = [row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]].some(
        (v) => v !== '' && v !== null && v !== undefined,
      );
      if (!hasAnyData) continue;
      if (!rollNo) {
        warnings.push(`${i + 1}행: Roll No.가 비어 있어 건너뛰었습니다.`);
        continue;
      }
      rolls.push({
        rollNo,
        color: toStringOrNull(row[2]),
        widthCm: toNumberOrNull(row[3]),
        widthInch: toNumberOrNull(row[4]),
        grossWeight: toNumberOrNull(row[5]),
        netWeight: toNumberOrNull(row[6]),
        thickness: toNumberOrNull(row[7]),
        lengthYd: toNumberOrNull(row[8]),
      });
    } else {
      const cartonNo = toStringOrNull(row[1]);
      const hasAnyData = [row[1], row[2], row[3], row[4], row[5], row[6], row[7]].some(
        (v) => v !== '' && v !== null && v !== undefined,
      );
      if (!hasAnyData) continue;
      if (!cartonNo) {
        warnings.push(`${i + 1}행: Carton No.가 비어 있어 건너뛰었습니다.`);
        continue;
      }
      cartons.push({
        cartonNo,
        color: toStringOrNull(row[2]),
        size: toStringOrNull(row[3]),
        lotNo: toStringOrNull(row[4]),
        qty: toNumberOrNull(row[5]) ?? 0,
        itemName: toStringOrNull(row[6]),
        weightKg: toNumberOrNull(row[7]),
      });
    }
  }

  if (rolls.length === 0 && cartons.length === 0) {
    throw new BadRequestException('표에 유효한 데이터 행이 없습니다. 예시 행만 있거나 비어 있는 것 같습니다.');
  }

  let cbm: number | null = null;
  let packageType: string | null = null;
  let declaredPackageCount: number | null = null;
  if (summaryRow) {
    cbm = toNumberOrNull(summaryRow[1]);
    declaredPackageCount = toNumberOrNull(summaryRow[3]);
    packageType = toStringOrNull(summaryRow[5]);
  }

  if (declaredPackageCount != null) {
    const actualCount = isFabric ? rolls.length : new Set(cartons.map((c) => c.cartonNo)).size;
    if (declaredPackageCount !== actualCount) {
      warnings.push(
        `요약행의 포장수(${declaredPackageCount})가 실제 입력된 ${isFabric ? '롤' : '카톤'} 수(${actualCount})와 다릅니다 — 확인해 주세요.`,
      );
    }
  }

  return { cbm, packageType, declaredPackageCount, rolls, cartons, warnings };
}
