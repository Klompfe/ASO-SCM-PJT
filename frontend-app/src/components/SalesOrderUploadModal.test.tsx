import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../api/salesOrders.service', () => ({
  uploadSalesOrderImage: vi.fn(),
  commitSalesOrderAnalysis: vi.fn(),
  getAiUsageSummary: vi.fn(),
}));
vi.mock('../api/items.service', () => ({ getAllItems: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getSimilarMasterStyles: vi.fn() }));

import { SalesOrderUploadModal } from './SalesOrderUploadModal';

// PR-200: 이 프로젝트는 jsdom/testing-library가 없어(HsCodeManager.test.tsx와 동일 방침)
// hook을 쓰는 컴포넌트는 renderToStaticMarkup으로 "에러 없이 그려지는지"만 확인한다.
// 끝 글자 칩 클릭·저장 차단·원본 패널 표시 등 상호작용은 results 상태가 업로드 응답으로
// 채워져야 나타나는데, 그건 내부 useState라 여기서 직접 주입할 수 없다 — 그런 동작은
// 이 코드베이스의 기존 관례대로(HsCodeManager.test.tsx 주석 참고) 실제 화면에서 확인한다.
describe('SalesOrderUploadModal — PR-200 안전장치 UI가 import 에러 없이 렌더링된다', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderUploadModal, { isOpen: false, onClose: vi.fn(), onSuccess: vi.fn() }),
    );
    expect(html).toBe('');
  });

  it('열려 있으면 업로드 폼을 그린다(OriginalPagePreview/visionGuardrails import가 깨지지 않음)', () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderUploadModal, { isOpen: true, onClose: vi.fn(), onSuccess: vi.fn() }),
    );
    expect(html).toContain('작업지시서');
  });

  // PR-221: 창 폭을 기존 max-w-4xl(896px)에서 넓혔다 — 모바일(w-full 유지)은 그대로,
  // 큰 화면에서만 더 넓게 쓸 수 있는 상한(1680px)만 올렸다.
  it('모달 폭이 기존 max-w-4xl보다 넓다(PR-221)', () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderUploadModal, { isOpen: true, onClose: vi.fn(), onSuccess: vi.fn() }),
    );
    expect(html).toContain('max-w-[1680px]');
    expect(html).not.toContain('max-w-4xl');
  });

  // PR-223: 업로드 전(results 비어 있음)에는 후보가 있을 수 없으므로 "수기 메모 후보"
  // 구역이 그려지지 않아야 한다(① 후보 0건이면 구역 없음). 후보가 있을 때의 렌더링은
  // 이 하네스(renderToStaticMarkup, jsdom 없음, results가 내부 useState)로 직접 검증할
  // 수 없어 순수 함수 테스트(salesOrderBomReview.test.ts)로 대신한다(PR-221/222와 동일 사유).
  it('수기 메모 후보가 없으면 "수기 메모 후보" 구역이 보이지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderUploadModal, { isOpen: true, onClose: vi.fn(), onSuccess: vi.fn() }),
    );
    expect(html).not.toContain('수기 메모 후보');
  });
});
