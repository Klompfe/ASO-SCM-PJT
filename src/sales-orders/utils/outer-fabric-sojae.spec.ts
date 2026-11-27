import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { isCompositionFabricCategory, isOuterFabricCategory, checkComposition } from './vision-guardrails.util';
import { buildOuterFabricAudit } from '../../boms/utils/outer-fabric-audit.util';
import { findOuterFabricPair } from '../../mapping/utils/outer-fabric-pair.util';
import { judgeOuterFabricSupplement } from '../../mapping/utils/outer-fabric-supplement.util';
import {
  classifySalesOrderBomCompare,
  type SalesOrderBomCompareExistingRow,
  type SalesOrderBomCompareIncomingRow,
} from '../../mapping/utils/sales-order-bom-compare.util';

// PR-261: 작지 맨 위 표 머리글 "소재" = 겉감. 구분이 "소재" 와 **정확히 같을 때만**(앞뒤 공백 제거·대소문자 무시) 겉감 계열로 인정한다.
// 한글은 단어 경계가 없어 부분·단어 일치를 쓰지 않는다(부소재·소재류·원단소재 등은 인정하지 않음 — fail-closed). 합성 데이터만.

// 정확 일치(앞뒤 공백·줄바꿈은 제거) → 인정.
const ACCEPTED = ['소재', ' 소재', '소재 ', '  소재  ', '\t소재\r\n'];
// 정확 일치가 아니면 인정하지 않음.
const REJECTED = [
  '부소재', '소재류', '원단소재', '부 소재', '원단 소재', '소재 원단', '소재1', '소재A', '소 재', '(소재)', '[소재]', '소재-', '-소재', '소재.', '소재,', '소재/심지', '소재\r\n심지', '겉감소재', '신소재 TAPE', 'SOJAE',
];

describe('구분 "소재" 정확 일치 인정 (PR-261)', () => {
  it.each(ACCEPTED.map((c) => [JSON.stringify(c), c]))('%s → 겉감 계열이자 원단류', (_l, c) => {
    expect(isOuterFabricCategory(c)).toBe(true);
    expect(isCompositionFabricCategory(c)).toBe(true);
    expect(checkComposition('X/Y=60/40', c).warnings).toEqual([]); // 부자재 경고가 붙지 않는다
  });

  it.each(REJECTED.map((c) => [JSON.stringify(c), c]))('%s → 인정하지 않음', (_l, c) => {
    expect(isOuterFabricCategory(c)).toBe(false);
    expect(isCompositionFabricCategory(c)).toBe(false);
  });

  it('기존 별칭 판정은 그대로다', () => {
    for (const c of ['겉감', '겉감 OUT-SHELL', 'out shell ', 'OUTER SHELL', '겉 감']) expect(isOuterFabricCategory(c)).toBe(true);
    for (const c of ['안감', 'LINING', 'INTERLINING', 'FABRIC', 'EDGE TAPE']) expect(isOuterFabricCategory(c)).toBe(false);
  });
});

describe('서버·프런트 판정 일치 (PR-261)', () => {
  // 프런트 compositionReview.ts 를 실제로 변환·실행해 같은 입력의 결과를 비교한다.
  const frontSrc = fs.readFileSync(path.resolve(__dirname, '../../../frontend-app/src/utils/compositionReview.ts'), 'utf8');
  const compiled = ts.transpileModule(frontSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod: { exports: any } = { exports: {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, () => ({}));
  const front = mod.exports as {
    isOuterFabricCategory: (c: unknown) => boolean;
    isCompositionTargetCategory: (c: unknown) => boolean;
    outerFabricStatus: (rows: unknown) => { kind: string };
  };
  const inputs: unknown[] = [...ACCEPTED, ...REJECTED, '겉감', '안감', 'LINING', '', '   ', null, undefined, 42];

  it.each(inputs.map((c) => [JSON.stringify(c) ?? 'undefined', c]))('%s → 겉감·원단류 판정이 같다', (_l, c) => {
    expect(front.isOuterFabricCategory(c)).toBe(isOuterFabricCategory(c as string));
    expect(front.isCompositionTargetCategory(c)).toBe(isCompositionFabricCategory(c as string));
  });

  it('겉감 상태(소재 단독·공존 포함)가 서버 점검 결과와 같다', () => {
    const cases: { category: string; composition: string | null }[][] = [
      [{ category: '소재', composition: 'X/Y=60/40' }],
      [{ category: '소재', composition: null }],
      [{ category: '부소재', composition: 'X/Y=60/40' }],
      [{ category: '소재', composition: 'X/Y=60/40' }, { category: '겉감', composition: null }],
    ];
    for (const rows of cases) {
      const audit = buildOuterFabricAudit([{ styleNo: 'S', styleName: null }], [{ id: 1, styleNo: 'S', isActive: true }], rows.map((r) => ({ bomId: 1, ...r }))).items[0];
      expect(audit == null ? 'filled' : audit.status).toBe(front.outerFabricStatus(rows).kind);
    }
  });
});

// ── 소비처별 동작 ─────────────────────────────────────────────────────
const audit = (rows: [string, string | null][]) =>
  buildOuterFabricAudit([{ styleNo: 'S', styleName: null }], [{ id: 1, styleNo: 'S', isActive: true }], rows.map(([category, composition]) => ({ bomId: 1, category, composition }))).items[0];
const ex = (bomItemId: number, category: string, itemName: string, composition: string | null = null): SalesOrderBomCompareExistingRow => ({
  bomItemId, itemName, englishName: null, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, unit: null, remarks: null, composition,
  hasManualOverride: false, hasConfirmedUnitPrice: false, hasSubtypeAssignment: false, linkedPurchaseOrderCount: 0, linkedReceivingCount: 0, canDelete: true, blockedReason: null,
});
const inc = (category: string, itemName: string, composition: string | null = null): SalesOrderBomCompareIncomingRow => ({ itemName, category, colorCode: null, spec: null, consumption: 1, requiredQty: 100, composition });
const live = (rows: [number, string, string][]) => rows.map(([bomItemId, category, itemName]) => ({ bomItemId, itemName, category, colorCode: null, spec: null, consumption: 1, linkedPoCount: 0 }));

describe('소재 단독 (PR-261)', () => {
  it('① 혼용률이 채워져 있으면 점검 목록에서 제외(겉감 있음·채워짐)', () => {
    expect(audit([['소재', 'X/Y=60/40'], ['안감', null]])).toBeUndefined();
  });
  it('② 혼용률이 비어 있으면 blank(겉감 혼용률 비어 있음)', () => {
    expect(audit([['소재', '  ']])).toMatchObject({ status: 'blank', outerRowCount: 1, blankOuterRows: 1 });
  });
  it('③ 겉감 계열 행이 전혀 없으면 noRow 그대로(부소재만 있어도)', () => {
    expect(audit([['부소재', 'X'], ['안감', 'Y']])).toMatchObject({ status: 'noRow', outerRowCount: 0 });
  });
  it('⑧ 겉감 보충 판정: 소재 단독 스타일은 "이미 겉감 있음"', () => {
    const r = judgeOuterFabricSupplement({ styleNo: 'S', registered: true, liveRows: live([[1, '소재', '원단합성']]), incomingRows: [{ category: '겉감 OUT-SHELL', itemName: '겉감 OUT-SHELL' }, { category: '안감', itemName: 'L' }] });
    expect(r).toMatchObject({ eligible: false, reason: 'ALREADY_HAS_OUTER_FABRIC' });
    expect(r.info.liveOuterFabricRows).toBe(1);
  });
  it('⑦ 겉감 짝: 기존 소재 1줄 + 새 겉감 1줄 → 짝 제안(삭제+추가로 갈라지지 않음)', () => {
    expect(findOuterFabricPair([{ bomItemId: 1, category: '소재' }], [{ category: '겉감' }])).toEqual({ existingBomItemId: 1, incomingIndex: 0 });
    const rows = classifySalesOrderBomCompare([ex(1, '소재', '원단합성')], [inc('겉감', '다른이름', 'X/Y=60/40')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'similar', outerFabricPair: true, compositionStatus: 'fillEmpty' });
    expect(rows.some((r) => r.type === 'existingOnly')).toBe(false); // 소재 행이 삭제 후보가 아니다
  });
});

// 공존은 새 규칙을 만들지 않는다 — "겉감 계열 2줄"과 똑같이 기존 로직이 처리한다.
describe('소재(채움) + 겉감(빈칸) 공존 — 겉감 계열 2줄과 동일 처리 (PR-261)', () => {
  const coexist: [string, string | null][] = [['소재', 'X/Y=60/40'], ['겉감', null]];

  it('④ 점검: 겉감 계열 2줄 중 하나가 비어 blank(의도: PR-255/256 "하나라도 비면 blank" 그대로)', () => {
    expect(audit(coexist)).toMatchObject({ status: 'blank', outerRowCount: 2, blankOuterRows: 1 });
    const pick = (a: ReturnType<typeof audit>) => a && [a.status, a.outerRowCount, a.blankOuterRows, a.totalRows];
    expect(pick(audit(coexist))).toEqual(pick(audit([['겉감', 'X/Y=60/40'], ['겉감', null]]))); // 겉감 2줄과 같은 결과
  });
  it('겉감 짝: 기존 겉감 계열이 2줄이라 짝을 만들지 않는다', () => {
    expect(findOuterFabricPair([{ bomItemId: 1, category: '소재' }, { bomItemId: 2, category: '겉감' }], [{ category: '겉감' }])).toBeNull();
    const rows = classifySalesOrderBomCompare([ex(1, '소재', '원단합성', 'X/Y=60/40'), ex(2, '겉감', '단편')], [inc('겉감', '다른이름', 'X/Y=60/40')]);
    expect(rows.some((r) => r.outerFabricPair)).toBe(false);
    // 알려진 한계: 이 경우 새 인식 우선 규칙대로 맞지 않는 기존 행은 existingOnly(화면 기본 삭제)가 된다.
    expect(rows.filter((r) => r.type === 'existingOnly').map((r) => r.existing!.bomItemId).sort()).toEqual([1, 2]);
  });
  it('겉감 보충: "이미 겉감 있음"(라이브 겉감 2줄)', () => {
    const r = judgeOuterFabricSupplement({ styleNo: 'S', registered: true, liveRows: live([[1, '소재', 'A'], [2, '겉감', 'B']]), incomingRows: [{ category: '겉감', itemName: '겉감' }] });
    expect(r).toMatchObject({ reason: 'ALREADY_HAS_OUTER_FABRIC' });
    expect(r.info.liveOuterFabricRows).toBe(2);
  });
});
