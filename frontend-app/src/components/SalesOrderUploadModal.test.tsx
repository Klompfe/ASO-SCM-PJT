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
});
