import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CurrencySelect, CurrencyChangeNotice } from './CurrencySelect';
import { KrwReferenceNote, KrwReferenceTotal } from './KrwReferenceNote';
import { MappingPreviewModalView } from './MappingPreviewModal';
import { CURRENCY_CHANGE_NOTICE, UPLOAD_KRW_NOTICE } from '../utils/currency';
import { NO_RATE_MESSAGE, PARTIAL_RATE_MESSAGE } from '../utils/krwReference';

// PR-244b: 정적 렌더(이 프로젝트에는 jsdom/testing-library 가 없다)로 확인할 수 있는 표시 규칙.
describe('CurrencySelect (PR-244b)', () => {
  const render = (value: string | null | undefined) =>
    renderToStaticMarkup(createElement(CurrencySelect, { value, onChange: vi.fn(), ariaLabel: '통화' }));

  it('NULL/빈 값/미지정은 KRW 가 선택돼 보인다', () => {
    for (const v of [null, undefined, '']) {
      expect(render(v)).toMatch(/<option value="KRW" selected/);
    }
  });

  it('USD 값은 USD 가 선택되고, KRW/USD 두 옵션만 있다', () => {
    const html = render('USD');
    expect(html).toMatch(/<option value="USD" selected/);
    expect((html.match(/<option /g) ?? []).length).toBe(2);
  });

  it('처음에는(바꾸기 전) 통화 변경 알림이 없고, 알림 문구는 지정된 문장이다', () => {
    expect(render('KRW')).not.toContain('자동 환산되지 않습니다');
    expect(renderToStaticMarkup(createElement(CurrencyChangeNotice))).toContain(CURRENCY_CHANGE_NOTICE);
    expect(CURRENCY_CHANGE_NOTICE).toBe('통화를 바꿔도 단가 숫자는 자동 환산되지 않습니다. 새 통화 기준 단가인지 확인해 주세요.');
  });
});

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('KrwReferenceNote / KrwReferenceTotal (PR-244b)', () => {
  const rates = new Map<string, number | null>([['2026-11-01', 1400], ['2026-11-08', null]]);

  it('환율 있음: 환산 금액·환율·기준일을 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(KrwReferenceNote, { usd: 10, date: '2026-11-01', rates }));
    expect(html).toContain('≈ 원화 환산 참고 ₩14,000');
    expect(html).toContain('수입환율 1,400');
    expect(html).toContain('기준일 2026-11-01');
  });

  it('환율 없음: 환산 금액을 비우고 안내를 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(KrwReferenceNote, { usd: 10, date: '2026-11-08', rates }));
    expect(html).toContain(esc(NO_RATE_MESSAGE));
    expect(html).not.toContain('₩');
  });

  it('조회 전(날짜 키 없음)에는 아무것도 보이지 않는다', () => {
    expect(renderToStaticMarkup(createElement(KrwReferenceNote, { usd: 10, date: '2026-12-31', rates }))).toBe('');
  });

  it('합계: 모두 있을 때만 환산 합계, 일부 없으면 "일부 행 환율 없음"(합계 비움), 전부 없으면 안내', () => {
    const ok = renderToStaticMarkup(createElement(KrwReferenceTotal, { rows: [{ usdAmount: 10, date: '2026-11-01' }, { usdAmount: 5, date: '2026-11-01' }], rates }));
    expect(ok).toContain('₩21,000');
    const partial = renderToStaticMarkup(createElement(KrwReferenceTotal, { rows: [{ usdAmount: 10, date: '2026-11-01' }, { usdAmount: 5, date: '2026-11-08' }], rates }));
    expect(partial).toContain(PARTIAL_RATE_MESSAGE);
    expect(partial).not.toContain('₩');
    const none = renderToStaticMarkup(createElement(KrwReferenceTotal, { rows: [{ usdAmount: 5, date: '2026-11-08' }], rates }));
    expect(none).toContain(esc(NO_RATE_MESSAGE));
    expect(renderToStaticMarkup(createElement(KrwReferenceTotal, { rows: [], rates }))).toBe('');
  });
});

describe('업로드 미리보기 문구 (PR-244b)', () => {
  it('업로드한 단가는 KRW 로 저장된다는 안내가 한 줄 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        data: { styleNo: 'MB00TEST' },
        styleOverview: { factory: 'F1', totalQty: 100, buyer: 'B', shipDate: '2026-01-01' },
        saving: false, result: null, error: null,
        onCommit: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn(),
        bomItems: [{ category: '부자재', itemName: '합성자재', consumption: 1, requiredQty: 10 }],
        packagingRules: [],
      } as never),
    );
    expect(html).toContain(UPLOAD_KRW_NOTICE);
    expect(UPLOAD_KRW_NOTICE).toContain('원화(KRW)로 저장됩니다');
  });
});
