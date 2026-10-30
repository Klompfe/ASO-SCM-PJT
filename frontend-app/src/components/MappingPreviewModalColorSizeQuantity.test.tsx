import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MappingPreviewModalView } from './MappingPreviewModal';

// PR-212: MATERIAL LIST 업로드 미리보기의 색상×사이즈 수량표 — 행=색상, 열=사이즈,
// 합계 포함. 수량이 없으면 "수량표 없음"을 보여준다. 표시 전용 컴포넌트라
// renderToStaticMarkup으로 전체 분기를 검증할 수 있다.
const baseProps = {
  data: { styleNo: 'MB00TEST' },
  bomItems: [],
  styleOverview: { factory: 'F1', totalQty: 0, buyer: 'B', shipDate: '2026-01-01' },
  saving: false,
  result: null,
  error: null,
  onCommit: vi.fn(),
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('MappingPreviewModalView 색상×사이즈 수량표 (PR-212)', () => {
  it('수량이 있으면 행=색상, 열=사이즈, 합계를 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        colorSizeQuantities: [
          { color: 'BK', size: '55', qty: 260 },
          { color: 'BK', size: '66', qty: 250 },
          { color: 'BE', size: '55', qty: 240 },
        ],
      }),
    );
    expect(html).toContain('color-size-quantity-table');
    expect(html).toContain('BK');
    expect(html).toContain('BE');
    expect(html).toContain('260');
    expect(html).not.toContain('수량표 없음');
  });

  it('수량이 없으면 "수량표 없음"을 보여준다', () => {
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, { ...baseProps, colorSizeQuantities: [] }));
    expect(html).toContain('수량표 없음');
  });

  it('colorSizeQuantities를 아예 안 넘겨도(선택 prop) 깨지지 않고 "수량표 없음"으로 안전하게 처리한다', () => {
    const html = renderToStaticMarkup(createElement(MappingPreviewModalView, baseProps));
    expect(html).toContain('수량표 없음');
  });

  it('총 생산수량이 0이고 색상×사이즈 합계가 있으면 합계를 대신 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        colorSizeQuantities: [{ color: 'NA', size: '55', qty: 700 }],
      }),
    );
    expect(html).toContain('700');
    expect(html).toContain('색상×사이즈 합계');
  });

  it('파서 경고(colorSizeQuantityWarnings)가 있으면 목록으로 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        colorSizeQuantities: [{ color: 'BK', size: '55', qty: 100 }],
        colorSizeQuantityWarnings: ['[QTY_CHINA_IGNORED] 중국 수량은 아직 지원하지 않아 무시했습니다.'],
      }),
    );
    expect(html).toContain('color-size-quantity-warnings');
    expect(html).toContain('QTY_CHINA_IGNORED');
  });
});
