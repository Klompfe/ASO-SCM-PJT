import type { ExcelColumn } from './excelExport';

export interface MaterialRequirementRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  categories: string[];
  colors: string[];
  consumptionPerUnit: number;
  requiredQty: number;
  orderedQty: number;
  shortageQty: number;
  lineCount: number;
}

export type RequirementReason = 'NO_STYLE_NO' | 'NO_BOM' | null;

export interface MaterialRequirements {
  workOrder: { id: number; itemId: number; itemName: string | null; targetQuantity: number; status: string };
  styleNo: string | null;
  reason: RequirementReason;
  bom: { id: number; bomNo: string; version: string; isActive?: boolean } | null;
  bomCount: number;
  rows: MaterialRequirementRow[];
  totals: { materialCount: number; shortageMaterialCount: number };
}

export const requirementColumns: ExcelColumn<MaterialRequirementRow>[] = [
  { header: '자재명', accessor: (r) => r.itemName },
  { header: '자재코드', accessor: (r) => r.itemCode },
  { header: '카테고리', accessor: (r) => r.categories.join(', ') },
  { header: '제품 1개당 소요량', accessor: (r) => r.consumptionPerUnit },
  { header: '필요 총수량', accessor: (r) => r.requiredQty },
  { header: '이미 발주 수량', accessor: (r) => r.orderedQty },
  { header: '부족 수량', accessor: (r) => r.shortageQty },
];

// BOM이 없을 때 화면에 띄우는 안내 문구. (에러가 아니라 정상적인 보고서 상태다.)
export const requirementEmptyMessage = (reason: RequirementReason): string | null => {
  if (reason === 'NO_BOM') return '이 스타일은 아직 BOM이 등록되지 않았습니다.';
  if (reason === 'NO_STYLE_NO') return '이 작업지시의 품목에는 스타일번호가 없어 BOM을 찾을 수 없습니다. 품목 마스터에서 스타일번호를 입력해 주세요.';
  return null;
};

export const describeRequirement = (r: MaterialRequirements): string => {
  const parts = [`작업지시 #${r.workOrder.id}`];
  if (r.styleNo) parts.push(`스타일 ${r.styleNo}`);
  parts.push(`물량 ${r.workOrder.targetQuantity.toLocaleString('ko-KR')}`);
  if (r.bom) parts.push(`BOM #${r.bom.id} ${r.bom.bomNo}${r.bomCount > 1 ? ` (스타일에 BOM ${r.bomCount}건 중 사용 중인 BOM)` : ''}`);
  return parts.join(' · ');
};

// ---------------------------------------------------------------------------------------------------------------------
// PR-129: 스타일(자재명세) 기준 소요명세서. 구매 계획은 작업지시가 만들어지기 전에 "이 스타일을 이만큼 만들면 자재가 얼마나 부족한가"를
// 보는 용도라, 기본 경로는 작업지시 없이 styleNo(+계획수량)만으로 계산하는 GET /work-orders/style-requirements다.
// 작업지시 기준 경로는 보조로 남기고, 두 응답을 화면이 한 벌의 표로 그릴 수 있게 같은 모양(RequirementView)으로 맞춘다.
// ---------------------------------------------------------------------------------------------------------------------
export type RequirementMode = 'STYLE' | 'WORK_ORDER';

export interface StyleRequirementsResponse {
  styleNo: string;
  styleExists: boolean;
  quantity: number;
  quantitySource: 'REQUESTED' | 'STYLE_TOTAL_QTY' | 'NONE';
  styleTotalQty: number;
  reason: RequirementReason;
  bom: MaterialRequirements['bom'];
  bomCount: number;
  rows: MaterialRequirementRow[];
  totals: MaterialRequirements['totals'];
}

export interface RequirementView {
  mode: RequirementMode;
  subtitle: string;
  // 요약 카드/설명에 쓰는 물량 이름: 스타일 기준은 "계획수량", 작업지시 기준은 "작업지시 물량"
  quantityLabel: string;
  quantity: number;
  styleNo: string | null;
  fileName: string;
  rows: MaterialRequirementRow[];
  totals: MaterialRequirements['totals'];
  // 표 대신 보여줄 안내(BOM 없음, 계획수량 없음 등). 없으면 표를 그린다.
  notice: string | null;
  // 수량이 어디서 왔는지 한 줄 설명(스타일 기준에서만)
  quantityNote: string | null;
}

const fmtQty = (n: number) => n.toLocaleString('ko-KR');

const bomText = (r: { bom: MaterialRequirements['bom']; bomCount: number }) =>
  r.bom ? `BOM #${r.bom.id} ${r.bom.bomNo}${r.bomCount > 1 ? ` (스타일에 BOM ${r.bomCount}건 중 사용 중인 BOM)` : ''}` : null;

// 인쇄/화면 부제: "스타일 MB62SLM103Z · 계획수량 1,000 · BOM #51 BOM-MB62-001"
export const describeStyleRequirement = (r: StyleRequirementsResponse): string => {
  const parts = [`스타일 ${r.styleNo}`, `계획수량 ${fmtQty(r.quantity)}`];
  const bom = bomText(r);
  if (bom) parts.push(bom);
  return parts.join(' · ');
};

export const NO_PLAN_QUANTITY_MESSAGE = '계획수량을 입력해 주세요. 이 스타일에는 등록된 총 생산수량이 없어 기본 수량이 없습니다.';

export const styleQuantityNote = (r: Pick<StyleRequirementsResponse, 'quantitySource' | 'styleTotalQty'>): string | null => {
  if (r.quantitySource === 'REQUESTED') return `입력한 계획수량 기준 (스타일 총 생산수량 ${fmtQty(r.styleTotalQty)})`;
  if (r.quantitySource === 'STYLE_TOTAL_QTY') return '수량을 비워 스타일의 총 생산수량 기준으로 계산했습니다.';
  return null;
};

export const toStyleView = (r: StyleRequirementsResponse): RequirementView => ({
  mode: 'STYLE',
  subtitle: describeStyleRequirement(r),
  quantityLabel: '계획수량',
  quantity: r.quantity,
  styleNo: r.styleNo,
  fileName: `BOM_소요명세서_${r.styleNo}`,
  rows: r.rows,
  totals: r.totals,
  // BOM 없음 문구는 작업지시 기준과 같은 것을 재사용(PR-126). BOM이 있어도 수량이 0이면 표가 전부 0이라 안내로 대신한다.
  notice: requirementEmptyMessage(r.reason) ?? (r.quantity > 0 ? null : NO_PLAN_QUANTITY_MESSAGE),
  quantityNote: styleQuantityNote(r),
});

export const toWorkOrderView = (r: MaterialRequirements): RequirementView => ({
  mode: 'WORK_ORDER',
  subtitle: describeRequirement(r),
  quantityLabel: '작업지시 물량',
  quantity: r.workOrder.targetQuantity,
  styleNo: r.styleNo,
  fileName: `BOM_소요명세서_${r.styleNo ?? r.workOrder.id}`,
  rows: r.rows,
  totals: r.totals,
  notice: requirementEmptyMessage(r.reason),
  quantityNote: null,
});

export type PlanQuantityParse = { ok: true; quantity: number | undefined } | { ok: false; message: string };

// 계획수량 입력: 비우면 undefined(=quantity 파라미터를 보내지 않아 서버가 스타일 총 생산수량을 쓴다), 0 이하/숫자 아님은 오류.
export function parsePlanQuantity(input: string): PlanQuantityParse {
  const t = input.trim().replace(/,/g, '');
  if (t === '') return { ok: true, quantity: undefined };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: '계획수량은 0보다 큰 숫자여야 합니다.' };
  return { ok: true, quantity: n };
}
