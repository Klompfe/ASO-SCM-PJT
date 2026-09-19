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
  bom: { id: number; bomNo: string; version: string } | null;
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
  if (r.bom) parts.push(`BOM ${r.bom.bomNo}${r.bomCount > 1 ? ` (스타일에 BOM ${r.bomCount}건 중 최신)` : ''}`);
  return parts.join(' · ');
};
