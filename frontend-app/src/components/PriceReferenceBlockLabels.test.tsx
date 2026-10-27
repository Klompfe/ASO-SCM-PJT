import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PriceReferenceBlock, shouldShowNoMatchNotice, noMatchNoticeText, type PriceReferenceValue } from './PriceReferenceBlock';
import type { PriceReferenceResult } from '../api/purchaseOrders.service';

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

// PR-204: 후보 0건일 때의 "단가표에서 맞는 항목을 찾지 못했습니다" 안내 표시 조건. 이
// 컴포넌트는 getPriceReference(비동기)로 state를 채워 동기 렌더 테스트로는 분기를 검증할
// 수 없어(위 describe의 주석과 동일한 제약), 조건만 뗀 순수 함수로 검증한다.
describe('shouldShowNoMatchNotice (PR-204)', () => {
  const base: PriceReferenceResult = { candidates: [], suggested: null, brand: null };

  it('후보 0건이고 다른 경고가 없으면 안내를 보여준다', () => {
    expect(shouldShowNoMatchNotice(base)).toBe(true);
  });

  it('result가 아직 없으면(비동기 응답 전) 안내를 보여주지 않는다', () => {
    expect(shouldShowNoMatchNotice(null)).toBe(false);
  });

  it('후보가 1건 이상이면 안내를 보여주지 않는다', () => {
    const withCandidate: PriceReferenceResult = {
      ...base,
      candidates: [{ source: 'MIDO_TABLE', label: '다데', priceUsd: 0.04, unit: '롤' }],
    };
    expect(shouldShowNoMatchNotice(withCandidate)).toBe(false);
  });

  it('종류 미지정 경고가 있으면(후보 0건이어도) 안내를 숨긴다 — 경고가 우선', () => {
    const withWarning: PriceReferenceResult = { ...base, warning: '실/테이프 종류 미지정 — 선택해 주세요' };
    expect(shouldShowNoMatchNotice(withWarning)).toBe(false);
  });

  it('단위 불일치 경고가 있으면 안내를 숨긴다 — 경고가 우선', () => {
    const withMismatch: PriceReferenceResult = {
      ...base,
      candidates: [{ source: 'MIDO_TABLE', label: '다데', priceUsd: 0.04, unit: '롤' }],
      unitMismatchWarning: '자재 단위(EA)와 단가 단위(M)가 다릅니다 — 환산해서 입력하세요.',
    };
    expect(shouldShowNoMatchNotice(withMismatch)).toBe(false);
  });
});

// PR-188R: PR-188의 "미도 브랜드 아님"(result.note)과 PR-204의 "단가표에서 못 찾음" 안내가
// 같은 자리를 다퉈 둘 다 뜰 수 있던 충돌을 note 우선으로 고정한다 — 동시에 뜨지 않는다.
describe('noMatchNoticeText (PR-188R) — note와 PR-204 안내 중 하나만', () => {
  const base: PriceReferenceResult = { candidates: [], suggested: null, brand: null };

  it('note가 있으면 note만 보여준다(PR-204 조건이 참이어도)', () => {
    const withNote: PriceReferenceResult = { ...base, note: '미도 브랜드가 아니라 단가표 후보를 보여주지 않습니다.' };
    expect(noMatchNoticeText(withNote, '암홀<실크>')).toBe('미도 브랜드가 아니라 단가표 후보를 보여주지 않습니다.');
  });

  it('note가 없고 후보 0건·경고 없음이면 PR-204 문구를 보여준다', () => {
    expect(noMatchNoticeText(base, '암홀<실크>')).toBe(
      '단가표에서 이 자재와 맞는 항목을 찾지 못했습니다(자재명: 암홀<실크>). 단가는 직접 입력하세요.',
    );
  });

  it('note도 없고 PR-204 조건도 거짓이면(경고가 있음) null — 아무 안내도 안 뜬다', () => {
    const withWarning: PriceReferenceResult = { ...base, warning: '실/테이프 종류 미지정 — 선택해 주세요' };
    expect(noMatchNoticeText(withWarning, '암홀<실크>')).toBeNull();
  });
});
