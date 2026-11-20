import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SalesOrderBomCompareStep } from './SalesOrderBomCompareStep';
import type { SalesOrderBomCompareRow, SalesOrderBomCompareExistingRow } from '../api/salesOrders.service';

// 이 프로젝트에는 jsdom/testing-library가 없어 클릭/onChange 같은 상호작용은
// renderToStaticMarkup으로 확인할 수 없다(기존 PR-226~231과 같은 제약) — 여기서는
// 초기 렌더(기본 선택·요약 숫자·삭제 불가 행 비활성·이유 문구)만 정적으로 확인한다.
// 결정 로직 자체(기본값/요약/위험 필터/페이로드)는 salesOrderBomCompareReview.test.ts에서
// 순수 함수로 철저히 검증한다.
const existing = (overrides: Partial<SalesOrderBomCompareExistingRow> = {}): SalesOrderBomCompareExistingRow => ({
  bomItemId: 1,
  itemName: '자재A',
  englishName: null,
  category: '부자재',
  colorCode: null,
  spec: null,
  consumption: 1,
  requiredQty: 100,
  unit: 'Y',
  remarks: null,
  hasManualOverride: false,
  hasConfirmedUnitPrice: false,
  hasSubtypeAssignment: false,
  linkedPurchaseOrderCount: 0,
  linkedReceivingCount: 0,
  canDelete: true,
  blockedReason: null,
  ...overrides,
});

describe('SalesOrderBomCompareStep (PR-235)', () => {
  it('요약 숫자와 상태 배지가 초기 렌더에 나타난다(기본 선택: same→갱신, similar/new→추가)', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'same', incomingIndex: 0, existing: existing({ bomItemId: 1 }), incoming: { itemName: '자재A' } },
      { type: 'similar', incomingIndex: 1, existing: existing({ bomItemId: 2, itemName: '자재B' }), incoming: { itemName: '자재B추가' } },
      { type: 'new', incomingIndex: 2, incoming: { itemName: '완전신규' } },
    ];
    const html = renderToStaticMarkup(
      createElement(SalesOrderBomCompareStep, { styleNo: 'MB00AAA000Z', rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }),
    );
    expect(html).toContain('MB00AAA000Z');
    expect(html).toContain('갱신 1');
    expect(html).toContain('합치기 0');
    expect(html).toContain('새로 추가 2');
    expect(html).toContain('동일 → 갱신');
    expect(html).toContain('비슷한 이름');
    expect(html).toContain('새 자재');
  });

  it('삭제할 수 없는 기존 행은 삭제 옵션이 비활성이고 이유 문구가 보인다', () => {
    const rows: SalesOrderBomCompareRow[] = [
      { type: 'existingOnly', existing: existing({ bomItemId: 3, canDelete: false, blockedReason: '발주 2건 연결' }) },
    ];
    const html = renderToStaticMarkup(
      createElement(SalesOrderBomCompareStep, { styleNo: null, rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }),
    );
    expect(html).toContain('발주 2건 연결');
    expect(html).toContain('disabled');
    expect(html).toContain('유지 1'); // canDelete=false면 기본값이 삭제가 아니라 유지.
  });

  it('삭제 가능한 기존 행은 기본값이 삭제이고 요약에 반영된다', () => {
    const rows: SalesOrderBomCompareRow[] = [{ type: 'existingOnly', existing: existing({ bomItemId: 4, canDelete: true }) }];
    const html = renderToStaticMarkup(
      createElement(SalesOrderBomCompareStep, { styleNo: null, rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }),
    );
    expect(html).toContain('삭제 1');
  });

  it('저장 중(saving=true)이면 버튼에 "저장 중..." 문구가 보인다', () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderBomCompareStep, { styleNo: null, rows: [], saving: true, onCancel: vi.fn(), onConfirm: vi.fn() }),
    );
    expect(html).toContain('저장 중...');
  });
});

// PR-246: 혼용률 상태 표시(정적 렌더 — 클릭 상태 전이는 salesOrderBomCompareReview.test.ts에서 검증).
describe('SalesOrderBomCompareStep — 혼용률 (PR-246)', () => {
  const render = (rows: SalesOrderBomCompareRow[]) =>
    renderToStaticMarkup(createElement(SalesOrderBomCompareStep, { styleNo: null, rows, saving: false, onCancel: vi.fn(), onConfirm: vi.fn() }));
  const sameRow = (compositionStatus: any, existingComposition: string | null, incomingComposition: string | null): SalesOrderBomCompareRow => ({
    type: 'same', incomingIndex: 0, existing: existing(), incoming: { itemName: '자재A' }, existingComposition, incomingComposition, compositionStatus,
  });

  it('differs: 기존/새 값을 나란히 보여 주고 기본은 유지 + "새 값으로 바꾸기" 버튼', () => {
    const html = render([sameRow('differs', 'COTTON 100%', 'COTTON 60% POLYESTER 40%')]);
    expect(html).toContain('기존 혼용률');
    expect(html).toContain('COTTON 100%');
    expect(html).toContain('COTTON 60% POLYESTER 40%');
    expect(html).toContain('기존 값을 유지합니다(기본)');
    expect(html).toContain('새 값으로 바꾸기');
  });

  it('fillEmpty: 기본 적용 안내 + 해제 버튼', () => {
    const html = render([sameRow('fillEmpty', null, 'COTTON 100%')]);
    expect(html).toContain('기존 값이 비어 있어 새 값으로 채웁니다');
    expect(html).toContain('채우지 않기');
  });

  it('same/incomingEmpty: 변화 없음 표시, 버튼 없음', () => {
    for (const status of ['same', 'incomingEmpty']) {
      const html = render([sameRow(status, 'COTTON 100%', status === 'same' ? 'COTTON 100%' : null)]);
      expect(html).toContain('혼용률: 변화 없음');
      expect(html).not.toContain('새 값으로 바꾸기');
    }
  });

  it('혼용률 상태가 없는 응답(구버전/비매칭 행)은 혼용률 영역을 그리지 않는다', () => {
    const html = render([{ type: 'same', incomingIndex: 0, existing: existing(), incoming: { itemName: '자재A' } }]);
    expect(html).not.toContain('composition-status');
  });

  it('비슷한 이름(similar)은 기본이 "새 자재로 추가"라 혼용률 영역을 그리지 않는다', () => {
    const html = render([{ ...sameRow('differs', 'A 100%', 'B 100%'), type: 'similar' }]);
    expect(html).not.toContain('composition-status');
  });
});

