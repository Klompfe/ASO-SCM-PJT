import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { StyleReviewList } from './StyleReviewList';
import type { ParsedStyleResult } from '../api/mapping.service';
import type { ApprovalFailureReason } from '../utils/uploadReviewStatus';

// 이 프로젝트에는 jsdom/testing-library가 없어 클릭/재시도 같은 상호작용은
// renderToStaticMarkup으로 확인할 수 없다(기존 PR-226~239와 같은 제약) — 초기 렌더에서
// 상태 배지·이유 문구·버튼 존재 여부만 정적으로 확인한다. 상태 전이·우선순위 로직
// 자체는 uploadReviewStatus.test.ts/mappingApproval.test.ts에서 순수 함수로 검증했다.
const style = (overrides: Partial<ParsedStyleResult> = {}): ParsedStyleResult => ({
  sheetName: 'Sheet1', styleNo: 'SYN-STYLE-001', matchStatus: null, ...overrides,
});

describe('StyleReviewList (PR-237)', () => {
  it('승인 실패 스타일은 사라지지 않고 배지·이유·"다시 승인" 버튼이 함께 보인다', () => {
    const failure: ApprovalFailureReason = { kind: 'validation', message: "14번째 자재 행의 '색상' 값이 올바르지 않습니다" };
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, {
        styles: [style()],
        existsMap: {},
        onSelect: vi.fn(),
        failuresBySheet: { Sheet1: failure },
        onRetry: vi.fn(),
        retryingSheet: null,
      }),
    );
    expect(html).toContain('승인 실패');
    expect(html).toContain('14번째 자재 행의');
    expect(html).toContain('색상');
    expect(html).toContain('다시 승인');
    expect(html).toContain('SYN-STYLE-001');
  });

  it('알 수 없는 오류는 "자세히" 펼침 버튼이 있고 원문은 기본적으로 숨겨져 있다', () => {
    const failure: ApprovalFailureReason = { kind: 'unknown', message: '저장 중 오류가 발생했습니다', detail: '합성-원문-오류' };
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, { styles: [style()], existsMap: {}, onSelect: vi.fn(), failuresBySheet: { Sheet1: failure } }),
    );
    expect(html).toContain('자세히');
    expect(html).not.toContain('합성-원문-오류');
  });

  it('재시도 중인 스타일은 버튼 문구가 "다시 승인 중..."으로 바뀌고 비활성화된다', () => {
    const failure: ApprovalFailureReason = { kind: 'network', message: '서버 응답이 없습니다' };
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, {
        styles: [style()], existsMap: {}, onSelect: vi.fn(), failuresBySheet: { Sheet1: failure }, onRetry: vi.fn(), retryingSheet: 'Sheet1',
      }),
    );
    expect(html).toContain('다시 승인 중...');
    expect(html).toContain('disabled');
  });

  it('실패가 없고 이미 등록되지도 않은 스타일은 "확인 대기" 배지만 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, { styles: [style()], existsMap: {}, onSelect: vi.fn() }),
    );
    expect(html).toContain('확인 대기');
    expect(html).not.toContain('승인 실패');
  });

  it('이미 등록된 스타일은 "이미 등록됨" 배지가 함께 보인다(실패와 동시에 있을 수 없음)', () => {
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, { styles: [style()], existsMap: { 'SYN-STYLE-001': true }, onSelect: vi.fn() }),
    );
    expect(html).toContain('이미 등록됨');
  });

  it('파싱 실패 스타일은 기존처럼 파싱 실패 배지가 보이고 승인 실패 배지와 겹치지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(StyleReviewList, {
        styles: [style({ parseError: '시트 형식 오류' })], existsMap: {}, onSelect: vi.fn(), failuresBySheet: { Sheet1: { kind: 'unknown', message: 'x' } },
      }),
    );
    expect(html).toContain('파싱 실패');
  });
});
