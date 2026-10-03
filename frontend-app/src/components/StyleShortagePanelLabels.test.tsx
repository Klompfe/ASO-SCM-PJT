import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// PR-174: StyleShortagePanel의 <summary>가 "스타일번호로 필요 자재 찾기"라고만 돼
// 있어 버튼인지 설명 제목인지 혼동이 있었다 — 사용법 안내 문구를 추가한다. 패널이
// <details open>이라 요약 영역은 상호작용 없이도 항상 보이므로 정적 렌더로 검증
// 가능하다. 표 위의 "자동으로 채워집니다" 안내는 스타일 선택(비동기 조회) 뒤에만
// 나타나 이 테스트 환경(renderToStaticMarkup, 상호작용 불가)에서는 검증할 수 없고,
// 라이브 브라우저(Puppeteer)로 별도 확인했다(완료 보고 참고).
vi.mock('../api/workOrders.service', () => ({ getStyleRequirements: vi.fn() }));
vi.mock('../api/styles.service', () => ({ getMasterStyles: vi.fn() }));

import { StyleShortagePanel } from './StyleShortagePanel';

describe('StyleShortagePanel 사용법 안내 (PR-174)', () => {
  it('summary 영역에 "클릭하면 ... 필요한 자재 목록을 볼 수 있습니다" 안내 문구가 렌더된다', () => {
    const html = renderToStaticMarkup(createElement(StyleShortagePanel, { onPickMaterial: vi.fn() }));
    expect(html).toContain('스타일번호로 필요 자재 찾기');
    expect(html).toContain('클릭하면 스타일번호로 조회해 필요한 자재 목록을 볼 수 있습니다');
  });
});
