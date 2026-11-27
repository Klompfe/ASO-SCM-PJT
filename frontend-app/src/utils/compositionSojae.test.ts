import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  isOuterFabricCategory,
  isCompositionTargetCategory,
  outerFabricStatus,
  summarizeCompositions,
  selectOuterFabricRowIndexes,
  selectFabricRowIndexes,
  countNonFabricSelected,
} from './compositionReview';
import { OuterFabricNotice } from '../components/CompositionSummary';

// PR-261: 구분 "소재"(작지 맨 위 표 머리글) = 겉감 — 구분 전체가 정확히 같을 때만. 합성 데이터만.
describe('구분 "소재" 정확 일치 (PR-261)', () => {
  it.each(['소재', ' 소재 ', '소재\r\n'])('%j 는 겉감 계열·원단류', (c) => {
    expect(isOuterFabricCategory(c)).toBe(true);
    expect(isCompositionTargetCategory(c)).toBe(true);
  });

  it.each(['부소재', '소재류', '원단소재', '원단 소재', '소재 원단', '소 재', '(소재)', '소재-', '소재1', '겉감소재', 'SOJAE'])('%j 는 인정하지 않음', (c) => {
    expect(isOuterFabricCategory(c)).toBe(false);
    expect(isCompositionTargetCategory(c)).toBe(false);
  });

  const notice = (rows: { category: string; composition: string | null }[]) =>
    renderToStaticMarkup(createElement(OuterFabricNotice, { status: outerFabricStatus(rows), testIdSuffix: 'bom' }));

  it('소재 단독 + 혼용률 입력: "겉감 행이 없습니다" 경고가 나오지 않고 값이 표시된다', () => {
    const html = notice([{ category: '소재', composition: 'X/Y=60/40' }, { category: '안감', composition: null }]);
    expect(html).toContain('겉감 혼용률: X/Y=60/40');
    expect(html).not.toContain('겉감 행이 없습니다');
    expect(html).not.toContain('bg-red-50');
  });

  it('소재 단독 + 빈 값: "겉감 혼용률이 비어 있습니다"', () => {
    const html = notice([{ category: '소재', composition: '' }]);
    expect(html).toContain('겉감 혼용률이 비어 있습니다');
    expect(html).not.toContain('겉감 행이 없습니다');
  });

  it('부소재만 있으면 여전히 "겉감 행이 없습니다"', () => {
    expect(notice([{ category: '부소재', composition: 'X' }])).toContain('겉감 행이 없습니다');
  });

  it('소재(채움)+겉감(빈칸) 공존: 겉감 2줄과 똑같이 "비어 있습니다"(하나라도 비면 blank)', () => {
    const rows = [{ category: '소재', composition: 'X/Y=60/40' }, { category: '겉감', composition: null }];
    expect(outerFabricStatus(rows)).toEqual({ kind: 'blank', rowCount: 2, blankRows: 1 });
    expect(notice(rows)).toContain('겉감 혼용률이 비어 있습니다');
  });

  it('요약·일괄 선택: 소재 빈 행은 겉감으로만 세고(노란 미기재 중복 없음), 겉감만·원단류 선택에 포함되며 부자재 확인창 대상이 아니다', () => {
    const rows = [{ category: '소재', composition: null }, { category: '안감', composition: null }, { category: '부소재', composition: null }];
    const s = summarizeCompositions(rows as never);
    expect(s.outer).toMatchObject({ kind: 'blank', rowCount: 1 });
    expect(s.missingRows).toBe(1); // 안감 1행만
    expect([...selectOuterFabricRowIndexes(rows)]).toEqual([0]);
    expect([...selectFabricRowIndexes(rows)]).toEqual([0, 1]);
    expect(countNonFabricSelected(rows, new Set([0, 2]))).toBe(1); // 부소재만 부자재로 센다
  });
});
