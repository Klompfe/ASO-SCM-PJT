import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CompositionSummary } from './CompositionSummary';

// jsdom이 없어 정적 렌더만 확인한다(표시·경고 문구·저장 비차단 — 이 컴포넌트에는 버튼/입력이 없다).
describe('CompositionSummary (PR-246)', () => {
  it('값이 있으면 모아서 보여 주고 미기재 행이 있으면 노란 경고를 함께 보여 준다', () => {
    const html = renderToStaticMarkup(
      createElement(CompositionSummary, {
        testIdSuffix: 0,
        summary: { groups: [{ value: 'COTTON 60% POLYESTER 40%', rowCount: 2 }, { value: 'POLYESTER 100%', rowCount: 1 }], missingRows: 2 },
      }),
    );
    expect(html).toContain('COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)');
    expect(html).toContain('혼용률 미기재 2행');
    expect(html).toContain('bg-yellow-50');
    expect(html).toContain('저장은 가능합니다');
  });

  it('값이 모두 비어 있으면 안내 문구만 보인다(경고 행 수가 0이면 행 경고는 없음)', () => {
    const html = renderToStaticMarkup(createElement(CompositionSummary, { testIdSuffix: 1, summary: { groups: [], missingRows: 0 } }));
    expect(html).toContain('혼용률 미기재(저장 후 자재·BOM 조회에서도 입력할 수 있습니다)');
    expect(html).not.toContain('composition-missing-warning');
  });

  it('요약에는 저장을 막는 버튼/입력이 없다', () => {
    const html = renderToStaticMarkup(createElement(CompositionSummary, { testIdSuffix: 2, summary: { groups: [], missingRows: 3 } }));
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('disabled');
  });
});
