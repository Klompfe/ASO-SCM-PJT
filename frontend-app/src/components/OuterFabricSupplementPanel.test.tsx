import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { OuterFabricSupplementView, OuterFabricSupplementPanel, type SupplementViewProps } from './OuterFabricSupplementPanel';
import type { ParsedStyleResult } from '../api/mapping.service';
import { DONE_HINT, FIRST_TIME_HINT, INTRO_TEXT, buildConfirmMessage } from '../utils/outerFabricSupplement';

// PR-259: jsdom 이 없어 클릭·체크 동작은 못 본다 — 초기 렌더(문구·상태 배지·버튼 활성/비활성·결과 요약)와 순수 로직만 확인한다.
const style = (styleNo: string): ParsedStyleResult => ({
  sheetName: `s-${styleNo}`, styleNo, matchStatus: null,
  bomItems: [{ id: 1, category: '겉감\r\nOUT-SHELL', itemName: '겉감 OUT-SHELL', consumption: 1.2 }, { id: 2, category: '안감', itemName: 'LIN', consumption: 1 }],
});
const row = (styleNo: string, check?: SupplementViewProps['rows'][number]['check']): SupplementViewProps['rows'][number] => ({ key: styleNo, styleNo, style: style(styleNo), check });

const base = (over: Partial<SupplementViewProps> = {}): SupplementViewProps => ({
  rows: [], checking: false, checkProgress: null, running: false, runProgress: null, selected: new Set(), doneKeys: new Set(), runResults: new Map(),
  summary: null, aborted: false, confirming: false,
  onCheck: vi.fn(), onRecheck: vi.fn(), onToggle: vi.fn(), onSelectAll: vi.fn(), onClear: vi.fn(), onAsk: vi.fn(), onConfirm: vi.fn(), onCancelConfirm: vi.fn(), onRetry: vi.fn(), ...over,
});
// React 는 disabled 를 data-testid 보다 앞에 출력하므로 버튼 태그 전체에서 확인한다.
const buttonTag = (html: string, id: string) => html.match(new RegExp('<button[^>]*data-testid="' + id + '"[^>]*>'))?.[0] ?? '';
const render = (over: Partial<SupplementViewProps> = {}) => renderToStaticMarkup(createElement(OuterFabricSupplementView, base(over)));

describe('겉감 행 일괄 보충 구역 (PR-259)', () => {
  it('점검 전: 설명 문구와 "겉감 보충 점검" 버튼만 보이고 결과 표·실행 버튼·"처음 1개" 안내는 없다', () => {
    const html = render({ rows: [row('A-1')] });
    expect(html).toContain(INTRO_TEXT);
    expect(html).toContain('겉감 보충 점검');
    expect(html).not.toContain('outer-fabric-supplement-table');
    expect(html).not.toContain('outer-fabric-supplement-run');
  });

  it('점검 후: 상태 5종 배지·추가될 겉감 행 미리보기·사유 문구, 기본 선택 없음, 실행 버튼 비활성, "처음 1개" 안내', () => {
    const html = render({
      rows: [
        row('A-1', { status: 'eligible', outerRowIndex: 0 }),
        row('B-1', { status: 'alreadyHas', reason: 'ALREADY_HAS_OUTER_FABRIC' }),
        row('C-1', { status: 'otherChanges', reason: 'OTHER_CHANGES' }),
        row('D-1', { status: 'notPossible', reason: 'NO_BOM' }),
        row('E-1', { status: 'needsCheck', reason: 'CALL_FAILED' }),
        row('F-1', { status: 'needsCheck', reason: 'DUPLICATE' }),
      ],
    });
    for (const label of ['보충 가능', '이미 겉감 있음', '다른 변경 있음', '보충 불가', '확인 필요']) expect(html).toContain(label);
    expect(html).toContain('구분 겉감 OUT-SHELL · 자재명 겉감 OUT-SHELL · 요척 1.2');
    expect(html).toContain('자재명세가 없거나 비어 있어 보충할 수 없습니다.');
    expect(html).toContain('같은 스타일 번호가 업로드 목록에 둘 이상');
    expect(html).toContain(FIRST_TIME_HINT);
    expect(html).not.toMatch(/checked=""/); // 기본 선택 없음
    expect(buttonTag(html, 'outer-fabric-supplement-run')).toContain('disabled=""'); // 선택 0개면 비활성
    // 보충 가능 행에만 선택 가능, 그 밖의 행 체크박스는 비활성
    const boxes = [...html.matchAll(/<input type="checkbox"([^>]*)\/>/g)].map((m) => m[1]);
    expect(boxes).toHaveLength(6);
    expect(boxes.filter((b) => !b.includes('disabled=""'))).toHaveLength(1);
    // 호출 실패 행에만 "다시 점검"(중복 행에는 없음)
    expect((html.match(/>다시 점검<\/button>/g) ?? []).length).toBe(1);
  });

  it('선택이 있으면 실행 버튼이 활성이고 선택 수를 보여 주며, 확인 패널에는 확인 문구와 스타일 번호 목록이 나온다', () => {
    const rows = [row('A-1', { status: 'eligible', outerRowIndex: 0 }), row('B-1', { status: 'eligible', outerRowIndex: 0 })];
    const html = render({ rows, selected: new Set(['A-1']), confirming: true });
    expect(buttonTag(html, 'outer-fabric-supplement-run')).not.toContain('disabled=""');
    expect(html).toContain('선택한 스타일에 겉감 행 추가 (1)');
    expect(html).toContain(buildConfirmMessage(1));
    expect(html).toContain('스타일 번호 목록 (1)');
    expect(html).toContain('계속');
    expect(html).toContain('취소');
  });

  it('실행/점검 중에는 버튼이 잠기고 진행률을 보여 준다(중복 실행 방지)', () => {
    const rows = [row('A-1', { status: 'eligible', outerRowIndex: 0 })];
    const running = render({ rows, running: true, runProgress: { done: 1, total: 3 }, selected: new Set(['A-1']) });
    expect(running).toContain('추가 중... (1/3)');
    expect(buttonTag(running, 'outer-fabric-supplement-run')).toContain('disabled=""');
    expect(buttonTag(running, 'outer-fabric-supplement-check')).toContain('disabled=""');
    const checking = render({ rows, checking: true, checkProgress: { done: 2, total: 5 } });
    expect(checking).toContain('점검 중... (2/5)');
  });

  it('결과: 요약 한 줄, 성공 행은 "보충 완료"(선택 불가), 실패·서버 오류 행에는 "다시 시도", 완료 안내', () => {
    const rows = [row('A-1', { status: 'eligible', outerRowIndex: 0 }), row('B-1', { status: 'eligible', outerRowIndex: 0 }), row('C-1', { status: 'eligible', outerRowIndex: 0 })];
    const html = render({
      rows,
      doneKeys: new Set(['A-1']),
      runResults: new Map([
        ['A-1', { kind: 'added' as const }],
        ['B-1', { kind: 'serverError' as const, reason: 'HTTP_500', at: '2026-01-01T00:00:00.000Z' }],
        ['C-1', { kind: 'failed' as const, reason: 'TIMEOUT' }],
      ]),
      summary: { added: 1, alreadyHas: 0, notEligible: 0, failed: 2 },
    });
    expect(html).toContain('성공 1 · 이미 겉감 있음 0 · 다른 변경 있음/보충 불가 0 · 실패(확인 필요) 2');
    expect(html).toContain('겉감 점검 탭에서 해당 스타일이');
expect(DONE_HINT).toContain('겉감 점검 탭에서 해당 스타일이');
    expect(html).toContain('보충 완료');
    expect(html).toContain('겉감 행 추가됨');
    expect(html).toContain('서버 오류 — 관리자에게 알려 주세요');
    expect((html.match(/>다시 시도<\/button>/g) ?? []).length).toBe(2);
    // 보충 완료 행의 체크박스는 비활성
    const boxA = html.match(/<input type="checkbox"([^>]*)aria-label="A-1 선택"/);
    expect(boxA?.[1]).toContain('disabled=""');
  });

  it('성공이 하나도 없으면 완료 안내(겉감 점검 탭)는 보이지 않고, 서버 오류 연속 중단 안내는 보인다', () => {
    const html = render({ rows: [row('A-1', { status: 'eligible', outerRowIndex: 0 })], summary: { added: 0, alreadyHas: 0, notEligible: 0, failed: 2 }, aborted: true });
    expect(html).not.toContain('겉감 점검 탭에서');
    expect(html).toContain('서버 오류가 연속 2회 발생해 남은 스타일의 실행을 중단했습니다');
  });

  it('컨테이너: 이미 등록된 스타일이 없으면 아무것도 그리지 않고, 있으면 구역을 그린다', () => {
    expect(renderToStaticMarkup(createElement(OuterFabricSupplementPanel, { styles: [style('A-1')], existsMap: { 'A-1': false } }))).toBe('');
    const html = renderToStaticMarkup(createElement(OuterFabricSupplementPanel, { styles: [style('A-1')], existsMap: { 'A-1': true } }));
    expect(html).toContain('겉감 행 일괄 보충');
    expect(html).toContain('겉감 보충 점검');
  });
});
