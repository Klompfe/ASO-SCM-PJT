import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { isOuterFabricCategory } from '../../sales-orders/utils/vision-guardrails.util';
import { buildOuterFabricAudit } from './outer-fabric-audit.util';

// PR-256: 서버 판정(isOuterFabricCategory / 점검 상태)과 프런트 판정(compositionReview.ts)이 같은 결과를 내는지 대조한다.
// 프런트 파일을 실제로 변환·실행해 비교한다(목록 문자열 비교가 아니라 동작 비교).
const frontSrc = fs.readFileSync(path.resolve(__dirname, '../../../frontend-app/src/utils/compositionReview.ts'), 'utf8');
const compiled = ts.transpileModule(frontSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod: { exports: any } = { exports: {} };
// eslint-disable-next-line @typescript-eslint/no-implied-eval
new Function('module', 'exports', 'require', compiled)(mod, mod.exports, () => ({}));
const front = mod.exports as {
  isOuterFabricCategory: (c: unknown) => boolean;
  outerFabricStatus: (rows: unknown) => { kind: 'noRow' | 'blank' | 'filled' };
};

const CATEGORIES: unknown[] = [
  '겉감', '겉감 OUT-SHELL', '겉감\r\nOUT-SHELL', '겉감                  OUT-SHELL', 'out shell ', 'OUTER SHELL', 'SHELL', '겉 감',
  '안감', 'LINING', '쉬폰 LINING', '배색 COMBINATION', 'INTERLINING', '심 지\r\nINTERLINING', 'EDGE TAPE', 'PAD', 'SHELL BUTTON',
  '배색 스쿠이사 45S/3H THREAD', 'FABRIC', '', '   ', null, undefined, 42,
];

describe('서버·프런트 겉감 판정 대조 (PR-256)', () => {
  it.each(CATEGORIES.map((c) => [JSON.stringify(c), c]))('구분 %s → 같은 결과', (_label, category) => {
    expect(isOuterFabricCategory(category as string)).toBe(front.isOuterFabricCategory(category));
  });

  it('겉감 상태(noRow/blank/filled)가 서버 점검 결과와 일치한다', () => {
    const cases: { category: unknown; composition: unknown }[][] = [
      [],
      [{ category: '안감', composition: 'P 100%' }],
      [{ category: '겉감', composition: '' }],
      [{ category: '겉감', composition: 'W 100%' }, { category: '겉감 OUT-SHELL', composition: null }],
      [{ category: '겉감', composition: 'W 100%' }],
      [{ category: 'INTERLINING', composition: 'X' }, { category: 42, composition: 'X' }],
    ];
    for (const rows of cases) {
      const f = front.outerFabricStatus(rows).kind;
      const audit = buildOuterFabricAudit(
        [{ styleNo: 'S', styleName: null }],
        rows.length ? [{ id: 1, styleNo: 'S', isActive: true }] : [],
        rows.map((r) => ({ bomId: 1, category: r.category, composition: r.composition })),
      ).items[0];
      // 서버는 BOM 행이 0 이면 noBom(프런트는 noRow), 채워졌으면 목록에서 제외(프런트는 filled)
      const server = audit == null ? 'filled' : audit.status === 'noBom' ? 'noRow' : audit.status;
      expect(server).toBe(f);
    }
  });
});
