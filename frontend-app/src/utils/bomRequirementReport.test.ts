import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import {
  describeRequirement,
  requirementColumns,
  requirementEmptyMessage,
  type MaterialRequirementRow,
  type MaterialRequirements,
} from './bomRequirementReport';

const rows: MaterialRequirementRow[] = [
  { itemId: 1, itemCode: 'M1', itemName: '원단A', categories: ['겉감'], colors: ['BK'], consumptionPerUnit: 1.25, requiredQty: 1250, orderedQty: 750, shortageQty: 500, lineCount: 1 },
  { itemId: 2, itemCode: 'M2', itemName: '단추', categories: ['부자재', '단추'], colors: [], consumptionPerUnit: 6, requiredQty: 6000, orderedQty: 8000, shortageQty: 0, lineCount: 2 },
];
const report = (over: Partial<MaterialRequirements> = {}): MaterialRequirements => ({
  workOrder: { id: 7, itemId: 1, itemName: 'FG', targetQuantity: 1000, status: 'PENDING' },
  styleNo: 'BF1', reason: null, bom: { id: 51, bomNo: 'BOM-BF1-001', version: 'V1' }, bomCount: 1, rows, totals: { materialCount: 2, shortageMaterialCount: 1 }, ...over,
});

describe('BOM 소요명세서 화면 유틸 (PR-120)', () => {
  it('BOM이 없으면 안내 문구, 스타일번호가 없으면 별도 안내, 정상이면 null', () => {
    expect(requirementEmptyMessage('NO_BOM')).toBe('이 스타일은 아직 BOM이 등록되지 않았습니다.');
    expect(requirementEmptyMessage('NO_STYLE_NO')).toContain('스타일번호');
    expect(requirementEmptyMessage(null)).toBeNull();
  });

  it('부제: 작업지시/스타일/물량/BOM, 중복 BOM이면 "사용 중인 BOM" 안내', () => {
    expect(describeRequirement(report())).toBe('작업지시 #7 · 스타일 BF1 · 물량 1,000 · BOM #51 BOM-BF1-001');
    expect(describeRequirement(report({ bomCount: 2 }))).toContain('스타일에 BOM 2건 중 사용 중인 BOM');
  });

  it('엑셀은 화면 계산 결과와 그대로 일치한다(재파싱)', async () => {
    const wb = await buildWorkbook(requirementColumns, rows, '소요');
    const p = XLSX.utils.sheet_to_json(wb.Sheets['소요'], { header: 1 }) as any[][];
    expect(p[0]).toEqual(['자재명', '자재코드', '카테고리', '제품 1개당 소요량', '필요 총수량', '이미 발주 수량', '부족 수량']);
    expect(p[1]).toEqual(['원단A', 'M1', '겉감', 1.25, 1250, 750, 500]);
    expect(p[2]).toEqual(['단추', 'M2', '부자재, 단추', 6, 6000, 8000, 0]);
  });
});
