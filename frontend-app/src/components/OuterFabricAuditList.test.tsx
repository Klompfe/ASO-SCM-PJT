import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { OuterFabricAuditView } from './OuterFabricAuditList';
import { AUDIT_EMPTY_MESSAGE, AUDIT_ERROR_MESSAGE, AUDIT_STATUS_BADGE, formatAuditSummary } from '../utils/outerFabricAudit';
import type { OuterFabricAuditResponse } from '../api/boms.service';

// PR-256: jsdom 이 없어 정적 렌더만 확인한다(요약·배지·빈/오류 상태·읽기 전용). 클릭("열기")은 못 보므로 onOpen 연결은 렌더된 버튼의 존재까지만 본다.
const sample: OuterFabricAuditResponse = {
  items: [
    { styleNo: 'SYN-A', styleName: '가상 이름', status: 'noRow', outerRowCount: 0, blankOuterRows: 0, totalRows: 4, categories: ['FABRIC', '안감'] },
    { styleNo: 'SYN-B', styleName: null, status: 'blank', outerRowCount: 2, blankOuterRows: 1, totalRows: 5, categories: ['겉감'] },
    { styleNo: 'SYN-C', styleName: null, status: 'noBom', outerRowCount: 0, blankOuterRows: 0, totalRows: 0, categories: [] },
  ],
  total: 3, page: 1, pageSize: 50, counts: { noRow: 1, blank: 1, noBom: 1, total: 3 }, styleCount: 10,
  // PR-262: 새 응답 필드(없으면 화면이 "의심 응답"으로 본다) — 요청 조건과 일치하는 합성 값.
  overall: { total: 10, noRow: 1, blank: 1, noBom: 1, okCount: 7 },
  applied: { q: '', status: 'all', page: 1, pageSize: 50 },
  generatedAt: '2026-01-01T00:00:00.000Z',
};

const render = (over: Partial<Parameters<typeof OuterFabricAuditView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(OuterFabricAuditView, {
      loading: false, error: false, data: sample, filter: 'all', q: '',
      onFilterChange: vi.fn(), onQChange: vi.fn(), onSearch: vi.fn(), onPage: vi.fn(), onOpen: vi.fn(), ...over,
    }),
  );

describe('겉감 점검 목록 (PR-256)', () => {
  it('요약 한 줄: 전체 스타일 수·점검 대상·상태별 개수', () => {
    expect(formatAuditSummary(sample)).toBe('전체 10개 스타일 중 점검 대상 3개 — 겉감 행 없음 1 · 겉감 혼용률 비어 있음 1 · BOM 없음 1');
    expect(render()).toContain('전체 10개 스타일 중 점검 대상 3개');
  });

  it('상태별 빨간 배지 문구와 겉감 행/전체 행·구분 값 목록·열기 버튼', () => {
    const html = render();
    for (const s of ['noRow', 'blank', 'noBom'] as const) {
      expect(html).toContain(AUDIT_STATUS_BADGE[s].label);
      expect(AUDIT_STATUS_BADGE[s].className).toContain('bg-red-100');
    }
    expect(html).toContain('겉감 행 없음');
    expect(html).toContain('겉감 혼용률 비어 있음');
    expect(html).toContain('BOM 없음');
    expect(html).toContain('0 / 4');
    expect(html).toContain('2 / 5');
    expect(html).toContain('FABRIC · 안감'); // 비표준 구분을 눈으로 확인할 수 있게 구분 값 표시
    expect(html).toContain('구분 값에 겉감과 비슷하지만 인식되지 않는 값');
    expect(html).toContain('outer-fabric-audit-open-SYN-A');
    expect(html).toContain('열기');
  });

  it('목록이 비면 안내 문구, 이때 표는 없다', () => {
    // PR-262: 초록 안내는 "빈 목록"이 아니라 확인된 전부 완료(okCount === total)일 때만 — 그 입력을 만든다.
    const html = render({ data: { ...sample, items: [], total: 0, counts: { noRow: 0, blank: 0, noBom: 0, total: 0 }, overall: { total: 10, noRow: 0, blank: 0, noBom: 0, okCount: 10 } } });
    expect(html).toContain(AUDIT_EMPTY_MESSAGE);
    expect(html).not.toContain('outer-fabric-audit-table');
  });

  it('오류일 때는 "문제 없음"처럼 보이지 않는다 — 오류 안내만 보이고 빈 상태·요약·표는 없다', () => {
    const html = render({ error: true, data: null });
    expect(html).toContain('outer-fabric-audit-error');
    expect(html).toContain('점검 목록을 불러오지 못했습니다');
    expect(html).toContain('&quot;문제 없음&quot;이 아닙니다'); // 정적 렌더가 따옴표를 이스케이프한다
    expect(AUDIT_ERROR_MESSAGE).toContain('"문제 없음"이 아닙니다');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
    expect(html).not.toContain('outer-fabric-audit-summary');
    expect(html).not.toContain('outer-fabric-audit-table');
    // 이전 데이터가 남아 있어도 오류 상태에서는 표·빈 상태를 그리지 않는다.
    const stale = render({ error: true });
    expect(stale).not.toContain('outer-fabric-audit-table');
    expect(stale).not.toContain('outer-fabric-audit-summary');
  });

  it('로딩 중에는 빈 상태 안내를 보이지 않는다', () => {
    const html = render({ loading: true, data: null });
    expect(html).toContain('불러오는 중');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('읽기 전용: 저장·수정·삭제·일괄 입력 버튼이 없고 버튼은 검색·열기·쪽 이동뿐이다', () => {
    const html = render();
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(new Set(labels)).toEqual(new Set(['검색', '열기', '이전', '다음']));
    for (const banned of ['저장', '수정', '삭제', '채우기', '일괄']) expect(html).not.toContain(banned + '</button>');
  });

  it('상태 필터 선택지: 전체 누락 / 겉감 행 없음 / 겉감 혼용률 비어 있음 / BOM 없음', () => {
    const html = render();
    for (const label of ['전체 누락', '겉감 행 없음', '겉감 혼용률 비어 있음', 'BOM 없음']) expect(html).toContain(`>${label}</option>`);
  });
});
