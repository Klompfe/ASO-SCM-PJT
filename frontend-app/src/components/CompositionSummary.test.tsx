import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CompositionSummary, OuterFabricNotice } from './CompositionSummary';
import { summarizeCompositions } from '../utils/compositionReview';

// jsdom이 없어 정적 렌더만 확인한다(표시·경고 문구·저장 비차단 — 이 컴포넌트에는 버튼/입력이 없다).
describe('CompositionSummary (PR-246)', () => {
  it('값이 있으면 모아서 보여 주고 미기재 행이 있으면 노란 경고를 함께 보여 준다', () => {
    const html = renderToStaticMarkup(
      createElement(CompositionSummary, {
        testIdSuffix: 0,
        summary: { groups: [{ value: 'COTTON 60% POLYESTER 40%', rowCount: 2 }, { value: 'POLYESTER 100%', rowCount: 1 }], missingRows: 2, outer: { kind: 'noRow' } },
      }),
    );
    expect(html).toContain('COTTON 60% POLYESTER 40% (2행) / POLYESTER 100% (1행)');
    expect(html).toContain('혼용률 미기재 2행');
    expect(html).toContain('bg-yellow-50');
    expect(html).toContain('저장은 가능합니다');
  });

  it('값이 모두 비어 있으면 안내 문구만 보인다(경고 행 수가 0이면 행 경고는 없음)', () => {
    const html = renderToStaticMarkup(createElement(CompositionSummary, { testIdSuffix: 1, summary: { groups: [], missingRows: 0, outer: { kind: 'noRow' } } }));
    expect(html).toContain('혼용률 미기재(저장 후 자재·BOM 조회에서도 입력할 수 있습니다)');
    expect(html).not.toContain('composition-missing-warning');
  });

  it('요약에는 저장을 막는 버튼/입력이 없다', () => {
    const html = renderToStaticMarkup(createElement(CompositionSummary, { testIdSuffix: 2, summary: { groups: [], missingRows: 3, outer: { kind: 'noRow' } } }));
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('disabled');
  });
});

// PR-255: 겉감 상태 강조(정적 렌더 — jsdom 없음, 클릭은 못 본다). 저장 버튼은 이 컴포넌트에 없다(비차단).
describe('OuterFabricNotice / CompositionSummary 겉감 강조 (PR-255)', () => {
  const render = (rows: { category: string; composition: string | null }[], onAdd?: () => void) =>
    renderToStaticMarkup(createElement(CompositionSummary, { testIdSuffix: 0, summary: summarizeCompositions(rows), onAddOuterRow: onAdd }));

  it('겉감 행 없음: 빨간 경고 + 재수입 세율 기준 문구 + (핸들러가 있으면) 겉감 행 추가 버튼, 저장 가능 문구', () => {
    const html = render([{ category: '안감', composition: 'A 100%' }], () => undefined);
    expect(html).toContain('outer-fabric-norow-0');
    expect(html).toContain('겉감 행이 없습니다');
    expect(html).toContain('완제품 재수입 세율 기준');
    expect(html).toContain('bg-red-50');
    expect(html).toContain('겉감 행 추가');
    expect(html).toContain('저장은 가능합니다');
    expect(html).not.toContain('disabled');
  });

  it('겉감 행 없음 + 핸들러 없음(엑셀 미리보기/조회): 버튼 대신 자재·BOM 조회 안내', () => {
    const html = render([], undefined);
    expect(html).not.toContain('겉감 행 추가');
    expect(html).toContain('자재·BOM 조회에서 겉감 행을 추가해 주세요');
  });

  it('겉감 혼용률 비어 있음: 빨간 경고, 안감 미기재는 기존 노란 경고로만(겉감 중복 없음)', () => {
    const html = render([{ category: '겉감 OUT-SHELL', composition: null }, { category: '안감', composition: null }]);
    expect(html).toContain('outer-fabric-blank-0');
    expect(html).toContain('겉감 혼용률이 비어 있습니다');
    expect(html).toContain('bg-red-50');
    expect(html).toContain('혼용률 미기재 1행'); // 안감 1행만
    expect(html).not.toContain('겉감 행이 없습니다');
  });

  it('겉감 입력됨: 요약 맨 앞에 "겉감 혼용률: 값" 을 먼저 표시하고 빨간 경고는 없다', () => {
    const html = render([{ category: '겉감', composition: 'WOOL 60% NYLON 40%' }, { category: '안감', composition: 'POLYESTER 100%' }]);
    expect(html).toContain('겉감 혼용률: WOOL 60% NYLON 40%');
    expect(html.indexOf('겉감 혼용률:')).toBeLessThan(html.indexOf('POLYESTER 100% (1행)'));
    expect(html).not.toContain('bg-red-50');
  });

  it('OuterFabricNotice 단독: 상태별 testid', () => {
    expect(renderToStaticMarkup(createElement(OuterFabricNotice, { testIdSuffix: 'x', status: { kind: 'filled', rowCount: 1, values: ['A'] } }))).toContain('outer-fabric-filled-x');
  });
});
