import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './excelExport';
import {
  NO_PLAN_QUANTITY_MESSAGE,
  describeRequirement,
  describeStyleRequirement,
  parsePlanQuantity,
  toStyleView,
  toWorkOrderView,
  type StyleRequirementsResponse,
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

// PR-129: 스타일(자재명세) 기준 소요명세서
const styleRes = (over: Partial<StyleRequirementsResponse> = {}): StyleRequirementsResponse => ({
  styleNo: 'MB62SLM103Z', styleExists: true, quantity: 1000, quantitySource: 'REQUESTED', styleTotalQty: 2000,
  reason: null, bom: { id: 51, bomNo: 'BOM-MB62-001', version: 'V1' }, bomCount: 1, rows, totals: { materialCount: 2, shortageMaterialCount: 1 }, ...over,
});

describe('BOM 소요명세서 — 스타일 기준 (PR-129)', () => {
  it('인쇄/화면 부제는 "스타일 … · 계획수량 …"이고 작업지시 번호는 나오지 않는다', () => {
    expect(describeStyleRequirement(styleRes())).toBe('스타일 MB62SLM103Z · 계획수량 1,000 · BOM #51 BOM-MB62-001');
    expect(describeStyleRequirement(styleRes())).not.toContain('작업지시');
    expect(describeStyleRequirement(styleRes({ bomCount: 3 }))).toContain('스타일에 BOM 3건 중 사용 중인 BOM');
    expect(describeStyleRequirement(styleRes({ bom: null, reason: 'NO_BOM' }))).toBe('스타일 MB62SLM103Z · 계획수량 1,000');
  });

  it('작업지시 기준 부제는 기존 그대로("작업지시 #…")다(회귀)', () => {
    expect(toWorkOrderView(report()).subtitle).toBe('작업지시 #7 · 스타일 BF1 · 물량 1,000 · BOM #51 BOM-BF1-001');
  });

  it('스타일 뷰: 계획수량 라벨/수량/파일명/표 데이터를 그대로 싣고 안내는 없다', () => {
    const v = toStyleView(styleRes());
    expect(v).toMatchObject({ mode: 'STYLE', quantityLabel: '계획수량', quantity: 1000, styleNo: 'MB62SLM103Z', fileName: 'BOM_소요명세서_MB62SLM103Z', notice: null });
    expect(v.rows).toBe(rows);
    expect(v.totals).toEqual({ materialCount: 2, shortageMaterialCount: 1 });
  });

  it('작업지시 뷰: 작업지시 물량 라벨/파일명은 기존과 같다(회귀)', () => {
    expect(toWorkOrderView(report())).toMatchObject({ mode: 'WORK_ORDER', quantityLabel: '작업지시 물량', quantity: 1000, fileName: 'BOM_소요명세서_BF1', notice: null });
    expect(toWorkOrderView(report({ styleNo: null })).fileName).toBe('BOM_소요명세서_7');
  });

  it('BOM이 없는 스타일은 PR-126과 같은 안내 문구를 쓴다', () => {
    const v = toStyleView(styleRes({ reason: 'NO_BOM', bom: null, rows: [], totals: { materialCount: 0, shortageMaterialCount: 0 } }));
    expect(v.notice).toBe('이 스타일은 아직 BOM이 등록되지 않았습니다.');
  });

  it('BOM은 있지만 계획수량이 0(스타일 총 생산수량도 없음)이면 수량 입력 안내를 띄운다', () => {
    const v = toStyleView(styleRes({ quantity: 0, quantitySource: 'NONE', styleTotalQty: 0 }));
    expect(v.notice).toBe(NO_PLAN_QUANTITY_MESSAGE);
    expect(v.quantityNote).toBeNull();
  });

  it('수량 출처 안내: 입력한 수량 / 스타일 총 생산수량', () => {
    expect(toStyleView(styleRes({ quantitySource: 'REQUESTED' })).quantityNote).toBe('입력한 계획수량 기준 (스타일 총 생산수량 2,000)');
    expect(toStyleView(styleRes({ quantitySource: 'STYLE_TOTAL_QTY', quantity: 2000 })).quantityNote).toBe('수량을 비워 스타일의 총 생산수량 기준으로 계산했습니다.');
  });

  describe('parsePlanQuantity', () => {
    it('비우면 undefined(=quantity 파라미터 생략)', () => {
      expect(parsePlanQuantity('')).toEqual({ ok: true, quantity: undefined });
      expect(parsePlanQuantity('   ')).toEqual({ ok: true, quantity: undefined });
    });
    it('양수는 숫자로(쉼표 허용)', () => {
      expect(parsePlanQuantity('1500')).toEqual({ ok: true, quantity: 1500 });
      expect(parsePlanQuantity(' 1,500 ')).toEqual({ ok: true, quantity: 1500 });
      expect(parsePlanQuantity('12.5')).toEqual({ ok: true, quantity: 12.5 });
    });
    it('0/음수/숫자 아님은 오류', () => {
      for (const bad of ['0', '-3', 'abc', '1e', 'NaN']) expect(parsePlanQuantity(bad).ok).toBe(false);
    });
  });
});
