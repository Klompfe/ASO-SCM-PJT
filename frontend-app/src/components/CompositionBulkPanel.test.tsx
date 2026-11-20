import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CompositionBulkPanel } from './CompositionBulkPanel';
import { CompositionMissingNotice } from './CompositionSummary';
import { MappingPreviewModalView } from './MappingPreviewModal';

// PR-248: jsdom 이 없어 클릭/입력은 못 본다 — 초기 렌더(패널 접힘 상태·버튼 문구·미리보기 열·미기재 안내)만 정적으로 확인.
// 채움 규칙 자체는 compositionReview.test.ts 의 applyBulkComposition 테스트가 검증한다.
describe('CompositionBulkPanel / 미리보기 혼용률 (PR-248)', () => {
  it('패널은 기본으로 접혀 있고 "선택 행에 혼용률 채우기" 열기 버튼만 보인다', () => {
    const html = renderToStaticMarkup(createElement(CompositionBulkPanel, { testIdSuffix: 0, items: [{ category: '겉감', itemName: 'A' }], onApply: vi.fn() }));
    expect(html).toContain('선택 행에 혼용률 채우기');
    expect(html).not.toContain('원단류 행 선택');
  });

  it('CompositionMissingNotice: 미기재 행이 있으면 노란 안내(저장 가능 문구), 0이면 아무것도 그리지 않는다', () => {
    const html = renderToStaticMarkup(createElement(CompositionMissingNotice, { missingRows: 3 }));
    expect(html).toContain('혼용률 미기재 3행');
    expect(html).toContain('저장 후에도 자재·BOM 조회에서 입력할 수 있습니다');
    expect(html).toContain('bg-yellow-50');
    expect(renderToStaticMarkup(createElement(CompositionMissingNotice, { missingRows: 0 }))).toBe('');
  });

  const baseProps = {
    data: { styleNo: 'SYN-1' },
    styleOverview: { factory: 'F', totalQty: 100, buyer: 'B', shipDate: '' },
    saving: false, result: null, error: null, onCommit: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn(),
  };

  it('매핑 미리보기: 혼용률 읽기 전용 열(값/미기재)과 원단류 미기재 안내가 보이고 승인 버튼은 막히지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        bomItems: [
          { category: '겉감', itemName: 'A', consumption: 1, requiredQty: 100, composition: 'c/p=60/40' },
          { category: '안감', itemName: 'B', consumption: 1, requiredQty: 100 },
          { category: '단추', itemName: 'C', consumption: 1, requiredQty: 100 },
        ],
      }),
    );
    expect(html).toContain('<th class="border p-2">혼용률</th>');
    expect(html).toContain('c/p=60/40');
    expect(html).toContain('혼용률 미기재 1행'); // 안감만(부자재 미기재는 제외)
    expect(html).not.toContain('<input'); // 열은 읽기 전용(일괄 입력 패널은 onBomItemsChange 가 있을 때만)
    expect(html).not.toMatch(/disabled=""[^>]*>\s*(승인|재승인)/);
  });

  it('원단류가 모두 채워져 있으면 미기재 안내가 없다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, { ...baseProps, bomItems: [{ category: '겉감', itemName: 'A', consumption: 1, requiredQty: 1, composition: 'X 100%' }] }),
    );
    expect(html).not.toContain('composition-missing-notice');
  });

  it('onBomItemsChange 를 주면 일괄 입력 패널이 그려진다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, { ...baseProps, bomItems: [{ category: '겉감', itemName: 'A', consumption: 1, requiredQty: 1 }], onBomItemsChange: vi.fn() }),
    );
    expect(html).toContain('composition-bulk-preview');
  });
});
