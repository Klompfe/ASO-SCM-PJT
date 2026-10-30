import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MappingPreviewModalView } from './MappingPreviewModal';
import type { MaterialPackagingUnitRule } from '../api/materialPackagingUnitRules.service';

// PR-216: MATERIAL LIST 업로드 미리보기 — 실/테이프 자재는 소수(예: "120") 대신 정수+
// 포장단위("3롤")로 보여준다. 종류를 자재명에서 하나로 못 정하면(여러 종류 매칭/매칭 없음)
// 경고만 보여주고 추측해서 계산하지 않는다. 일반 자재(겉감 등)는 기존처럼 그대로 보여준다.
// 이 뷰는 상태 없는 표시 전용 컴포넌트라 renderToStaticMarkup으로 전체 분기를 검증할 수 있다.
const RULES: MaterialPackagingUnitRule[] = [
  { id: 4, materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
  { id: 5, materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 },
];

const baseProps = {
  data: { styleNo: 'MB00TEST' },
  styleOverview: { factory: 'F1', totalQty: 100, buyer: 'B', shipDate: '2026-01-01' },
  saving: false,
  result: null,
  error: null,
  onCommit: vi.fn(),
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('MappingPreviewModalView 포장단위 표시 (PR-216)', () => {
  it('종류가 하나로 확정되는 실/테이프 자재는 정수+포장단위로 보여준다(소수 없음)', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        bomItems: [{ category: '부자재', itemName: '암홀 테이프', consumption: 1.2, requiredQty: 120 }],
        packagingRules: RULES,
      }),
    );
    expect(html).toContain('3롤');
    expect(html).not.toContain('>120<');
  });

  it('실/테이프로 보이지만 종류를 하나로 못 정하면 경고만 보여주고 원래 소수값을 그대로 둔다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        bomItems: [{ category: '부자재', itemName: '테이프(TAPE) 10MM', consumption: 1, requiredQty: 100 }],
        packagingRules: RULES,
      }),
    );
    expect(html).toContain('종류 확인 필요');
    expect(html).toContain('>100<');
  });

  it('일반 자재(실/테이프로 보이지 않음)는 포장단위 규칙이 있어도 기존처럼 그대로 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        bomItems: [{ category: '겉감', itemName: '겉감(WOOL 60~70%)', consumption: 1.5, requiredQty: 150.5 }],
        packagingRules: RULES,
      }),
    );
    expect(html).toContain('150.5');
  });

  it('packagingRules가 비어 있어도(규칙 미로딩) 기존 소수 표시로 안전하게 폴백한다', () => {
    const html = renderToStaticMarkup(
      createElement(MappingPreviewModalView, {
        ...baseProps,
        bomItems: [{ category: '부자재', itemName: '암홀 테이프', consumption: 1.2, requiredQty: 120 }],
        packagingRules: [],
      }),
    );
    expect(html).toContain('>120<');
  });
});
