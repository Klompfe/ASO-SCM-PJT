import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PriceReferenceBlock, type PriceReferenceValue } from './PriceReferenceBlock';

// PR-187: 단가표 참고 블록 — getPriceReference는 비동기라 이 환경(jsdom/상호작용 시뮬레이션
// 없이 renderToStaticMarkup만 사용)에서는 fetch가 해석되기 전의 동기 초기 렌더만 검증할 수
// 있다(ThreadTapeClassificationManagerLabels.test.tsx와 동일한 제약). 환산 후보 근거 문구·
// 경고 표시 등 비동기 상태에 의존하는 분기는 price-reference.service.spec.ts(백엔드, 24건)의
// 실제 응답 스키마와 PurchaseOrdersManager의 코드 리뷰로 검증했다.
const emptyValue: PriceReferenceValue = { usd: null, source: null, note: null };

describe('PriceReferenceBlock (PR-187)', () => {
  it('itemId가 있으면 "단가표 참고(USD)" 블록과 입력칸을 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(PriceReferenceBlock, { itemId: 1, value: emptyValue, onChange: () => {} }),
    );
    expect(html).toContain('단가표 참고(USD)');
    expect(html).toContain('단가표 참고단가(USD)');
    expect(html).toContain('data-testid="price-reference-block"');
  });

  it('itemId가 없으면 아무것도 렌더하지 않는다(기존 동작 유지)', () => {
    const html = renderToStaticMarkup(
      createElement(PriceReferenceBlock, { itemId: null, value: emptyValue, onChange: () => {} }),
    );
    expect(html).toBe('');
  });

  it('onPackagingUnitLabel 콜백을 넘기지 않아도 렌더에 영향이 없다(선택 prop)', () => {
    const html = renderToStaticMarkup(
      createElement(PriceReferenceBlock, { itemId: 2, value: emptyValue, onChange: () => {} }),
    );
    expect(html).toContain('단가표 참고(USD)');
  });
});
