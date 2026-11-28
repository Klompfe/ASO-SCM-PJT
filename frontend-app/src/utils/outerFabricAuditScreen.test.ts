import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  AUDIT_EMPTY_MESSAGE,
  AUDIT_NO_STYLES_MESSAGE,
  AUDIT_SEARCH_SCOPE_NOTE,
  AUDIT_SUSPECT_MESSAGE,
  AUDIT_UNAPPLIED_HINT,
  AUDIT_ZERO_STATUS_MESSAGE,
  createLatestGate,
  decideAuditScreen,
  findAuditInconsistency,
  runAuditLoad,
  type AuditLoadState,
  type AuditRequest,
} from './outerFabricAudit';
import { OuterFabricAuditView } from '../components/OuterFabricAuditList';
import type { OuterFabricAuditItem, OuterFabricAuditResponse } from '../api/boms.service';

// PR-262: 겉감 점검 화면의 상태 결정·일관성 검사·최신 응답만 반영 — 합성 값만, 네트워크 호출 0. jsdom 이 없어 클릭은 못 본다.
const req = (over: Partial<AuditRequest> = {}): AuditRequest => ({ status: 'all', q: '', page: 1, pageSize: 50, ...over });
const item = (n: number, status: OuterFabricAuditItem['status'] = 'noRow'): OuterFabricAuditItem => ({ styleNo: `SYN-${n}`, styleName: null, status, outerRowCount: 0, blankOuterRows: 0, totalRows: 3, categories: [] });

// 서버(PR-262)가 만들 법한, 앞뒤가 맞는 응답. 전체 89 = noRow 55 + blank 17 + noBom 17 + 완료 0 을 기본으로 한다.
function response(over: {
  request?: AuditRequest;
  overall?: { total: number; noRow: number; blank: number; noBom: number; okCount: number };
  searched?: { noRow: number; blank: number; noBom: number };
  items?: OuterFabricAuditItem[];
} = {}): OuterFabricAuditResponse {
  const request = over.request ?? req();
  const overall = over.overall ?? { total: 89, noRow: 55, blank: 17, noBom: 17, okCount: 0 };
  const s = over.searched ?? { noRow: overall.noRow, blank: overall.blank, noBom: overall.noBom };
  const counts = { ...s, total: s.noRow + s.blank + s.noBom };
  const total = request.status === 'all' ? counts.total : counts[request.status];
  const length = Math.max(0, Math.min(request.pageSize, total - (request.page - 1) * request.pageSize));
  return {
    items: over.items ?? Array.from({ length }, (_, i) => item(i)),
    total, page: request.page, pageSize: request.pageSize, counts, styleCount: overall.total, overall,
    applied: { ...request }, generatedAt: '2026-01-01T00:00:00.000Z',
  };
}
const screenOf = (data: OuterFabricAuditResponse, request = req()) => decideAuditScreen({ loading: false, error: false, data, request });
const allDone = { total: 89, noRow: 0, blank: 0, noBom: 0, okCount: 89 };
const render = (data: OuterFabricAuditResponse | null, request = req(), extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(OuterFabricAuditView, {
    loading: false, error: false, data, filter: request.status, q: request.q, appliedQ: request.q, page: request.page,
    onFilterChange: vi.fn(), onQChange: vi.fn(), onSearch: vi.fn(), onPage: vi.fn(), onOpen: vi.fn(), ...extra,
  }));

describe('⑥⑦ 빈 상태 분기와 초록의 유일한 조건', () => {
  it('PILOT-30 재현: 전체 89개인데 맞는 것 없는 검색어 → 초록이 아니라 "검색 결과 없음"', () => {
    const request = req({ q: 'zzz-없는검색어' });
    const data = response({ request, searched: { noRow: 0, blank: 0, noBom: 0 } });
    expect(screenOf(data, request)).toMatchObject({ kind: 'empty', empty: 'noSearchResult' });
    const html = render(data, request);
    expect(html).toContain('검색 결과 없음 (검색어: zzz-없는검색어)');
    expect(html).toContain(AUDIT_SEARCH_SCOPE_NOTE);
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
    expect(html).not.toContain('bg-green-50');
    // 요약 첫 줄은 전체 기준(0·0·0 으로 보이지 않는다)
    expect(html).toContain('전체 89개 스타일 중 점검 대상 89개 — 겉감 행 없음 55 · 겉감 혼용률 비어 있음 17 · BOM 없음 17');
    expect(html).toContain('검색 결과 중 점검 대상 0개');
  });

  it('0건인 상태 필터(다른 누락이 있음) → "이 상태는 0건입니다", 초록 아님', () => {
    const request = req({ status: 'blank' });
    const data = response({ request, overall: { total: 89, noRow: 72, blank: 0, noBom: 17, okCount: 0 } });
    expect(screenOf(data, request)).toMatchObject({ empty: 'zeroStatus' });
    const html = render(data, request);
    expect(html).toContain(AUDIT_ZERO_STATUS_MESSAGE);
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('전부 완료여도 필터를 고른 상태면 초록이 아니라 "이 상태는 0건"', () => {
    const request = req({ status: 'noRow' });
    expect(screenOf(response({ request, overall: allDone }), request)).toMatchObject({ empty: 'zeroStatus' });
  });

  it('전부 완료여도 검색어가 적용 중이면 초록이 아니라 "검색 결과 없음"', () => {
    const request = req({ q: 'abc' });
    expect(screenOf(response({ request, overall: allDone }), request)).toMatchObject({ empty: 'noSearchResult' });
  });

  it('마지막 쪽을 넘으면 "마지막 쪽을 넘었습니다" + 1쪽으로, 초록 아님', () => {
    const request = req({ page: 3 });
    const data = response({ request });
    expect(data.items).toHaveLength(0);
    expect(screenOf(data, request)).toMatchObject({ empty: 'pageOverflow' });
    const html = render(data, request);
    expect(html).toContain('마지막 쪽을 넘었습니다(3쪽)');
    expect(html).toContain('1쪽으로');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('검색 결과는 있는데 쪽을 넘은 경우는 "검색 결과 없음"이 아니라 쪽 안내', () => {
    const request = req({ q: 'syn', page: 5 });
    expect(screenOf(response({ request, searched: { noRow: 3, blank: 0, noBom: 0 } }), request)).toMatchObject({ empty: 'pageOverflow' });
  });

  it('스타일이 0개면 "등록된 스타일이 없습니다"(초록 아님)', () => {
    const data = response({ overall: { total: 0, noRow: 0, blank: 0, noBom: 0, okCount: 0 } });
    expect(screenOf(data)).toMatchObject({ empty: 'noStyles' });
    expect(render(data)).toContain(AUDIT_NO_STYLES_MESSAGE);
    expect(render(data)).not.toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('초록 조건 충족: 검색 없음·전체 누락·입력 완료 === 전체 > 0', () => {
    const data = response({ overall: allDone });
    expect(screenOf(data)).toMatchObject({ kind: 'empty', empty: 'allDone' });
    expect(render(data)).toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('⑦ 조건 조합을 전부 돌려도 초록은 (검색 없음, 전체 누락, 1쪽, okCount===total>0) 하나뿐이다', () => {
    const greens: string[] = [];
    const overalls = [allDone, { total: 89, noRow: 55, blank: 17, noBom: 17, okCount: 0 }, { total: 89, noRow: 0, blank: 0, noBom: 1, okCount: 88 }, { total: 0, noRow: 0, blank: 0, noBom: 0, okCount: 0 }];
    for (const status of ['all', 'noRow', 'blank', 'noBom'] as const) {
      for (const q of ['', 'x']) {
        for (const page of [1, 2]) {
          overalls.forEach((overall, i) => {
            const request = req({ status, q, page });
            const searchedSets = q === '' ? [undefined] : [{ noRow: 0, blank: 0, noBom: 0 }, undefined];
            for (const searched of searchedSets) {
              const s = screenOf(response({ request, overall, searched }), request);
              if (s.kind === 'empty' && s.empty === 'allDone') greens.push(`${status}|${q}|${page}|${i}`);
            }
          });
        }
      }
    }
    expect(greens).toEqual(['all||1|0']);
  });

  it('목록이 있으면 표를 보인다', () => {
    expect(screenOf(response()).kind).toBe('list');
  });
});

describe('⑧ 의심 응답 → 숫자·목록을 숨기고 경고 + 다시 조회', () => {
  const good = () => response();
  const bad: [string, (r: OuterFabricAuditResponse) => unknown, string][] = [
    ['overall 누락(옛 서버)', (r) => ({ ...r, overall: undefined }), 'missing-fields'],
    ['applied 누락', (r) => ({ ...r, applied: undefined }), 'missing-fields'],
    ['generatedAt 누락', (r) => ({ ...r, generatedAt: undefined }), 'missing-fields'],
    ['불변식 위반', (r) => ({ ...r, overall: { ...r.overall!, okCount: 5 } }), 'invariant'],
    ['전체 수 불일치', (r) => ({ ...r, styleCount: 90 }), 'style-count'],
    ['개수 합 불일치', (r) => ({ ...r, counts: { ...r.counts, total: 1 } }), 'counts-sum'],
    ['검색이 없는데 개수가 전체와 다름(전체 89·누락 0)', (r) => ({ ...r, counts: { noRow: 0, blank: 0, noBom: 0, total: 0 }, total: 0, items: [] }), 'counts-vs-overall'],
    ['applied 검색어 불일치(이전 요청의 응답)', (r) => ({ ...r, applied: { ...r.applied!, q: 'old' } }), 'applied-mismatch'],
    ['applied 상태 불일치', (r) => ({ ...r, applied: { ...r.applied!, status: 'blank' } }), 'applied-mismatch'],
    ['applied 쪽 불일치', (r) => ({ ...r, applied: { ...r.applied!, page: 2 }, page: 2 }), 'applied-mismatch'],
    ['필터 후 건수 불일치', (r) => ({ ...r, total: 3 }), 'filtered-total'],
    ['항목 수 불일치(부분 응답)', (r) => ({ ...r, items: [] }), 'items-length'],
    ['숫자가 아닌 값', (r) => ({ ...r, counts: { ...r.counts, noRow: '55' } }), 'shape'],
    ['items 없음', (r) => ({ ...r, items: undefined }), 'shape'],
  ];

  it.each(bad)('%s', (_label, mutate, reason) => {
    const data = mutate(good()) as OuterFabricAuditResponse;
    expect(findAuditInconsistency(data, req())).toBe(reason);
    expect(screenOf(data)).toEqual({ kind: 'suspect' });
    const html = render(data);
    expect(html).toContain(AUDIT_SUSPECT_MESSAGE);
    expect(html).toContain('outer-fabric-audit-reload');
    expect(html).toContain('다시 조회');
    expect(html).not.toContain('outer-fabric-audit-summary');
    expect(html).not.toContain('outer-fabric-audit-table');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
    expect(html).not.toMatch(/점검 대상 \d+개/); // 숫자를 남기지 않는다
  });

  it('정상 응답은 의심이 아니고, null·문자열 응답은 의심이다', () => {
    expect(findAuditInconsistency(good(), req())).toBeNull();
    expect(findAuditInconsistency(null, req())).toBe('shape');
    expect(findAuditInconsistency('<html>', req())).toBe('shape');
    expect(decideAuditScreen({ loading: false, error: false, data: null, request: req() })).toEqual({ kind: 'suspect' });
  });
});

describe('⑨⑩ 최신 요청의 응답만 반영, 이전 숫자를 남기지 않는다', () => {
  const deferred = () => {
    let resolve!: (v: OuterFabricAuditResponse) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<OuterFabricAuditResponse>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const collect = () => {
    const states: AuditLoadState[] = [];
    return { states, apply: (s: AuditLoadState) => states.push(s), last: () => states[states.length - 1] };
  };

  it('순서가 뒤바뀌어 늦게 온 이전 검색 응답(0건)은 버린다', async () => {
    const gate = createLatestGate();
    const out = collect();
    const slow = deferred();
    const fast = deferred();
    const oldRequest = req({ q: 'zzz' });
    const newRequest = req();
    const a = runAuditLoad(gate, oldRequest, () => slow.promise, out.apply);
    const b = runAuditLoad(gate, newRequest, () => fast.promise, out.apply);
    fast.resolve(response());
    await b;
    slow.resolve(response({ request: oldRequest, searched: { noRow: 0, blank: 0, noBom: 0 } }));
    await a;
    expect(out.last()).toMatchObject({ loading: false, error: false, request: newRequest });
    expect(out.last().data!.counts.total).toBe(89);
    expect(out.states.filter((s) => !s.loading)).toHaveLength(1);
  });

  it('늦게 온 이전 요청의 실패도 최신 성공 화면을 덮지 않는다', async () => {
    const gate = createLatestGate();
    const out = collect();
    const first = deferred();
    const a = runAuditLoad(gate, req({ q: 'a' }), () => first.promise, out.apply);
    await runAuditLoad(gate, req(), async () => response(), out.apply);
    first.reject(new Error('late failure'));
    await a;
    expect(out.last()).toMatchObject({ loading: false, error: false });
  });

  it('새 조회를 시작하면 이전 숫자를 지우고 로딩만 보인다, 실패하면 숫자 없이 오류', async () => {
    const gate = createLatestGate();
    const out = collect();
    await runAuditLoad(gate, req(), async () => response(), out.apply);
    const next = deferred();
    const p = runAuditLoad(gate, req({ page: 2 }), () => next.promise, out.apply);
    expect(out.last()).toMatchObject({ loading: true, data: null });
    next.reject(Object.assign(new Error('x'), { response: { status: 500 } }));
    await p;
    expect(out.last()).toMatchObject({ loading: false, error: true, data: null });
    const html = render(out.last().data, out.last().request, { error: true });
    expect(html).toContain('outer-fabric-audit-error');
    expect(html).toContain('다시 조회');
    expect(html).not.toContain('outer-fabric-audit-summary');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
  });

  it('로딩 중에는 데이터가 있어도 숫자·초록·빈 상태를 보이지 않는다', () => {
    const html = render(response({ overall: allDone }), req(), { loading: true });
    expect(html).toContain('불러오는 중');
    expect(html).not.toContain('outer-fabric-audit-summary');
    expect(html).not.toContain(AUDIT_EMPTY_MESSAGE);
    expect(html).not.toContain(AUDIT_SUSPECT_MESSAGE);
  });
});

describe('적용 중인 조건 표시', () => {
  it('적용 중인 검색어는 칩(× 해제)으로 보이고, 검색어가 없으면 칩이 없다', () => {
    const request = req({ q: 'abc' });
    const html = render(response({ request, searched: { noRow: 1, blank: 0, noBom: 0 } }), request);
    expect(html).toContain('적용 중인 검색어: abc');
    expect(html).toContain('outer-fabric-audit-chip-clear');
    expect(html).toContain('aria-label="검색어 해제"');
    expect(render(response())).not.toContain('outer-fabric-audit-chip');
  });

  it('입력칸과 적용 중 검색어가 다르면(검색칸을 지우고 검색을 안 누른 경우 포함) 안내한다 — 칩은 남아 있다', () => {
    const request = req({ q: 'abc' });
    const data = response({ request, searched: { noRow: 0, blank: 0, noBom: 0 } });
    const cleared = render(data, request, { q: '' });
    expect(cleared).toContain('입력한 검색어는 아직 적용되지 않았습니다');
    expect(cleared).toContain('적용 중인 검색어: abc');
    expect(render(data, request, { q: 'abc' })).not.toContain('outer-fabric-audit-unapplied');
    expect(AUDIT_UNAPPLIED_HINT).toContain("'검색'을 눌러 주세요");
  });
});
