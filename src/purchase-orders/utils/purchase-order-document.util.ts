import * as xlsx from 'xlsx';

// PR-178: 공급업체에 전달하는 발주서 표준 양식(엑셀). 생성 유틸만 두고 조회는 서비스가 한다.
// 발행 주체(상호)는 시스템 사이드바와 같은 회사명을 쓴다.
export const PURCHASE_ORDER_ISSUER_NAME = '태일무역';
export const PRICE_PENDING_NOTE = '추후 통보(선적서류 작성 시 확정)';

export interface PurchaseOrderDocumentLine {
  color?: string | null;
  size?: string | null;
  qty: number;
}

export interface PurchaseOrderDocumentContext {
  purchaseOrderId: number;
  orderDate: string | null;
  requiredDate: string | null;
  supplierName: string | null;
  supplierContact: string | null;
  supplierAddress: string | null;
  itemName: string | null;
  itemEnglishName: string | null;
  composition: string | null;
  hsCode: string | null;
  styleNo: string | null;
  factory: string | null;
  quantity: number;
  unitPrice: number | null;
  notes: string | null;
  // 색상/사이즈 라인이 있으면 라인별 내역을 표에 넣고, 없으면 총수량만 쓴다.
  lines: PurchaseOrderDocumentLine[];
}

export function buildPurchaseOrderDocumentSheetData(ctx: PurchaseOrderDocumentContext): (string | number)[][] {
  const priceCell: string | number = ctx.unitPrice != null ? ctx.unitPrice : PRICE_PENDING_NOTE;
  const amountCell: string | number = ctx.unitPrice != null ? ctx.unitPrice * ctx.quantity : PRICE_PENDING_NOTE;

  const rows: (string | number)[][] = [
    [`발 주 서 (PURCHASE ORDER)`],
    [],
    ['발주번호', `#${ctx.purchaseOrderId}`, '', '발행처', PURCHASE_ORDER_ISSUER_NAME],
    ['발주일자', ctx.orderDate ?? '', '', '납기일', ctx.requiredDate ?? ''],
    [],
    ['공급업체', ctx.supplierName ?? ''],
    ['연락처', ctx.supplierContact ?? ''],
    ['주소', ctx.supplierAddress ?? ''],
    [],
    ['스타일번호', ctx.styleNo ?? '', '', '생산처', ctx.factory ?? ''],
    ['자재명', ctx.itemName ?? ''],
    ['영문명', ctx.itemEnglishName ?? ''],
    ['혼용률', ctx.composition ?? ''],
    ['HS코드', ctx.hsCode ?? ''],
    [],
  ];

  if (ctx.lines.length > 0) {
    rows.push(['No.', '색상', '사이즈', '수량']);
    ctx.lines.forEach((l, i) => rows.push([i + 1, l.color ?? '', l.size ?? '', l.qty]));
    rows.push(['', '', '합계', ctx.quantity]);
  } else {
    rows.push(['수량', ctx.quantity]);
  }

  rows.push([]);
  rows.push(['단가', priceCell]);
  rows.push(['금액', amountCell]);
  rows.push(['비고', ctx.notes ?? '']);
  return rows;
}

export function buildPurchaseOrderDocumentBuffer(ctx: PurchaseOrderDocumentContext): Buffer {
  const data = buildPurchaseOrderDocumentSheetData(ctx);
  const sheet = xlsx.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, '발주서');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// PR-194: 다품번 일괄발주 — 업체별로 묶은 발주서 1장(스타일별 수량 내역 + 합계). 발주
// 1건 = 품목 1개 × 스타일 1개 구조는 그대로 두고(스타일별 부족분·입고 추적 유지), 이
// 함수는 "업체에 보내는 서류"만 여러 발주를 합쳐 만든다. 기존 단건 함수는 건드리지 않는다.
export interface CombinedPurchaseOrderDocumentLine {
  purchaseOrderId: number;
  categoryGroup: string; // 품목군 — Item.category.name → BOM 구분(categories[0]) → '미분류'
  materialSubTypeLabel: string | null; // 실/테이프 종류 라벨(해당 없으면 null) — 품목군 아래 한 줄
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  styleNo: string | null;
  quantity: number;
  unitPrice: number | null;
  requiredDate: string | null; // 스타일의 납기(targetRdd) — 없으면 빈칸(추정 금지)
  notes: string | null;
}

export interface CombinedPurchaseOrderDocumentContext {
  orderDate: string; // 발주서 발행일(합본 생성 시점)
  supplierName: string;
  supplierContact: string | null;
  supplierAddress: string | null;
  lines: CombinedPurchaseOrderDocumentLine[];
}

const num = (v: number): string | number => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0);

// 같은 품목(itemCode+itemName 기준)의 모든 행 단가가 전부 있고 전부 같으면 그 값을,
// 아니면(하나라도 비었거나 서로 다르면) null을 돌려준다 — 추측해서 하나로 합치지 않는다.
function uniformUnitPrice(prices: (number | null)[]): number | null {
  if (prices.length === 0 || prices.some((p) => p == null)) return null;
  const [first, ...rest] = prices as number[];
  return rest.every((p) => p === first) ? first : null;
}

export function buildCombinedPurchaseOrderDocumentSheetData(ctx: CombinedPurchaseOrderDocumentContext): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['발 주 서 (PURCHASE ORDER) — 합본'],
    [],
    ['발주일자', ctx.orderDate, '', '발행처', PURCHASE_ORDER_ISSUER_NAME],
    [],
    ['공급업체', ctx.supplierName],
    ['연락처', ctx.supplierContact ?? ''],
    ['주소', ctx.supplierAddress ?? ''],
    [],
    ['품목군', '품목명(코드)', '단위', '스타일번호', '수량', '단가', '금액', '요구납기', '비고'],
  ];

  // 품목군 → 품목 순 정렬(같은 품목군끼리 묶어서 보기 쉽게). 품목 안에서는 입력 순서 유지.
  const sortedLines = [...ctx.lines].sort((a, b) => {
    if (a.categoryGroup !== b.categoryGroup) return a.categoryGroup.localeCompare(b.categoryGroup, 'ko');
    return a.itemName.localeCompare(b.itemName, 'ko');
  });

  // 품목(itemCode+itemName) 단위로 묶어 소계를 낸다.
  const itemKey = (l: CombinedPurchaseOrderDocumentLine) => `${l.categoryGroup}\u0000${l.itemCode ?? ''}\u0000${l.itemName}`;
  const itemGroups = new Map<string, CombinedPurchaseOrderDocumentLine[]>();
  for (const line of sortedLines) {
    const key = itemKey(line);
    const list = itemGroups.get(key) ?? [];
    list.push(line);
    itemGroups.set(key, list);
  }

  let grandTotalQty = 0;
  let grandTotalAmount = 0;
  let grandTotalAmountKnown = true;

  for (const groupLines of itemGroups.values()) {
    for (const line of groupLines) {
      const itemLabel = line.materialSubTypeLabel ? `${line.itemName}(${line.materialSubTypeLabel})` : line.itemName;
      const priceCell: string | number = line.unitPrice != null ? num(line.unitPrice) : PRICE_PENDING_NOTE;
      const amountCell: string | number = line.unitPrice != null ? num(line.unitPrice * line.quantity) : PRICE_PENDING_NOTE;
      rows.push([
        line.categoryGroup,
        line.itemCode ? `${itemLabel}(${line.itemCode})` : itemLabel,
        line.unit ?? '',
        line.styleNo ?? '',
        num(line.quantity),
        priceCell,
        amountCell,
        line.requiredDate ?? '',
        line.notes ?? '',
      ]);
    }

    const qtySum = groupLines.reduce((s, l) => s + l.quantity, 0);
    const uniformPrice = uniformUnitPrice(groupLines.map((l) => l.unitPrice));
    const subtotalPriceCell: string | number = uniformPrice != null ? num(uniformPrice) : PRICE_PENDING_NOTE;
    const subtotalAmountCell: string | number = uniformPrice != null ? num(uniformPrice * qtySum) : PRICE_PENDING_NOTE;
    const first = groupLines[0];
    rows.push([first.categoryGroup, `${first.itemName} 소계`, first.unit ?? '', '', num(qtySum), subtotalPriceCell, subtotalAmountCell, '', '']);

    grandTotalQty += qtySum;
    if (uniformPrice != null) {
      grandTotalAmount += uniformPrice * qtySum;
    } else {
      grandTotalAmountKnown = false;
    }
  }

  rows.push([]);
  rows.push(['', '업체 전체 합계', '', '', num(grandTotalQty), '', grandTotalAmountKnown ? num(grandTotalAmount) : PRICE_PENDING_NOTE, '', '']);
  return rows;
}

export function buildCombinedPurchaseOrderDocumentBuffer(ctx: CombinedPurchaseOrderDocumentContext): Buffer {
  const data = buildCombinedPurchaseOrderDocumentSheetData(ctx);
  const sheet = xlsx.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, '합본발주서');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
