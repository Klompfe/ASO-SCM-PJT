import { describe, it, expect, vi } from 'vitest';
import logicSrc from './outerFabricSupplement.ts?raw';
import panelSrc from '../components/OuterFabricSupplementPanel.tsx?raw';
import {
  KNOWN_REASONS,
  buildConfirmMessage,
  buildSupplementRows,
  checkStateFromRunResult,
  describeRunResult,
  failedCheck,
  formatRunSummary,
  interpretCheckResponse,
  interpretRunError,
  interpretRunResponse,
  isSelectable,
  previewOuterRow,
  runSupplementQueue,
  runnableTargets,
  selectAllEligible,
  summarizeRun,
  toggleSelection,
  type RunResult,
  type SupplementRow,
} from './outerFabricSupplement';

// PR-259: 겉감 행 일괄 보충(화면 편) 순수 로직 — 합성 값만, 네트워크 호출 0.
const style = (styleNo: string, extra: Record<string, unknown> = {}) => ({
  sheetName: `시트-${styleNo}`, styleNo,
  bomItems: [{ category: '겉감\r\nOUT-SHELL', itemName: '겉감 OUT-SHELL', consumption: 1.2 }, { category: '안감', itemName: 'LIN', consumption: 1 }],
  ...extra,
});
const eligibleRes = (extra: Record<string, unknown> = {}) => ({ eligible: true, applied: false, outerRowIndex: 0, message: 'ok', ...extra });
const inelig = (reason: string) => ({ eligible: false, applied: false, reason, message: `m-${reason}` });

describe('interpretCheckResponse — 서버 응답 → 화면 상태 (PR-259)', () => {
  it('eligible:true → 보충 가능(추가될 행 인덱스 포함)', () => {
    expect(interpretCheckResponse(eligibleRes())).toMatchObject({ status: 'eligible', outerRowIndex: 0 });
  });

  it.each([
    ['ALREADY_HAS_OUTER_FABRIC', 'alreadyHas'],
    ['OTHER_CHANGES', 'otherChanges'],
    ['MULTIPLE_OUTER_FABRIC_ROWS', 'otherChanges'],
    ['NOT_REGISTERED', 'notPossible'],
    ['NO_BOM', 'notPossible'],
    ['NO_OUTER_FABRIC_ROW', 'notPossible'],
    ['EMPTY_NAME', 'notPossible'],
    ['INVALID_INPUT', 'needsCheck'],
  ])('사유 %s → %s', (reason, status) => {
    expect(interpretCheckResponse(inelig(reason))).toMatchObject({ status, reason });
  });

  it('알려진 사유 코드 8종이 전부 매핑된다', () => {
    expect(KNOWN_REASONS).toHaveLength(8);
    for (const r of KNOWN_REASONS) expect(interpretCheckResponse(inelig(r)).status).toBeDefined();
  });

  it('fail-closed: 알 수 없는 사유 코드·누락 필드·형식 이상은 모두 확인 필요(보충 가능으로 새지 않음)', () => {
    for (const bad of [
      inelig('SOMETHING_NEW'), { eligible: false, applied: false }, { eligible: 'true' }, { applied: false }, {},
      null, undefined, 'ok', 42, [], [eligibleRes()], { eligible: true, applied: true }, // 읽기 전용 점검이 applied:true 라고 답하면 이상
    ]) {
      expect(interpretCheckResponse(bad).status).toBe('needsCheck');
    }
    expect(failedCheck()).toMatchObject({ status: 'needsCheck', reason: 'CALL_FAILED' });
  });

  it('eligible:true 인데 outerRowIndex 가 없거나 이상하면 보충 가능은 유지하되 미리보기만 없다', () => {
    for (const idx of [undefined, -1, 1.5, '0', null]) {
      const s = interpretCheckResponse(eligibleRes({ outerRowIndex: idx }));
      expect(s.status).toBe('eligible');
      expect(s.outerRowIndex).toBeUndefined();
    }
  });
});

describe('interpretRunResponse / interpretRunError — applied:true 만 성공 (PR-259)', () => {
  it('applied:true & eligible:true 만 added', () => {
    expect(interpretRunResponse({ eligible: true, applied: true, addedBomItemId: 7 }).kind).toBe('added');
  });

  it('eligible:true 라도 applied 가 true 가 아니면 성공이 아니다', () => {
    for (const res of [{ eligible: true, applied: false }, { eligible: true }, { eligible: true, applied: 'true' }, { eligible: true, applied: 1 }]) {
      expect(interpretRunResponse(res).kind).not.toBe('added');
    }
  });

  it('applied:true 인데 eligible 이 true 가 아니면(모순) 성공이 아니다', () => {
    expect(interpretRunResponse({ eligible: false, applied: true }).kind).toBe('failed');
  });

  it('이미 겉감 있음·부적격 사유는 성공이 아니고 구분해서 기록한다, 알 수 없거나 이상하면 실패', () => {
    expect(interpretRunResponse(inelig('ALREADY_HAS_OUTER_FABRIC')).kind).toBe('alreadyHas');
    expect(interpretRunResponse(inelig('OTHER_CHANGES')).kind).toBe('ineligible');
    expect(interpretRunResponse(inelig('INVALID_INPUT')).kind).toBe('failed');
    expect(interpretRunResponse(inelig('NEW_CODE')).kind).toBe('failed');
    for (const bad of [null, undefined, 'x', 3, [], {}, { eligible: false }, { applied: false }]) expect(interpretRunResponse(bad).kind).toBe('failed');
  });

  it('예외: HTTP 5xx 는 serverError, 시간 초과·네트워크·4xx 는 failed', () => {
    const at = () => new Date('2026-01-01T00:00:00Z');
    expect(interpretRunError({ response: { status: 500 } }, at)).toMatchObject({ kind: 'serverError', reason: 'HTTP_500', at: '2026-01-01T00:00:00.000Z' });
    expect(interpretRunError({ response: { status: 503 } }, at).kind).toBe('serverError');
    expect(interpretRunError({ code: 'ECONNABORTED' }, at)).toMatchObject({ kind: 'failed', reason: 'TIMEOUT' });
    expect(interpretRunError(new Error('x'), at)).toMatchObject({ kind: 'failed', reason: 'NETWORK' });
    expect(interpretRunError({ response: { status: 400 } }, at)).toMatchObject({ kind: 'failed', reason: 'HTTP_400' });
    expect(interpretRunError(null, at).kind).toBe('failed');
  });

  it('실행 결과가 "대상 아님"을 알려 주면 행 상태가 바뀐다', () => {
    expect(checkStateFromRunResult(interpretRunResponse(inelig('ALREADY_HAS_OUTER_FABRIC')))).toMatchObject({ status: 'alreadyHas' });
    expect(checkStateFromRunResult(interpretRunResponse(inelig('OTHER_CHANGES')))).toMatchObject({ status: 'otherChanges' });
    expect(checkStateFromRunResult({ kind: 'failed' })).toBeNull();
    expect(checkStateFromRunResult({ kind: 'added' })).toBeNull();
  });
});

describe('buildSupplementRows / 선택 규칙 (PR-259)', () => {
  const styles = [style('A-1'), style('B-1'), style('C-1'), style('c-1'), style('D-1'), style('', {}), { ...style('E-1'), parseError: 'x' }];
  const existsMap = { 'A-1': true, 'B-1': false, 'C-1': true, 'c-1': true, 'D-1': true, 'E-1': true };

  it('이미 등록된 스타일만 대상, 같은 정규화 번호가 둘 이상이면 모두 확인 필요(중복)로 두고 점검 대상에서 뺀다', () => {
    const { checkable, duplicates } = buildSupplementRows(styles, existsMap);
    expect(checkable.map((r) => r.styleNo)).toEqual(['A-1', 'D-1']);
    expect(duplicates.map((r) => r.styleNo).sort()).toEqual(['C-1', 'c-1']);
    expect(duplicates.every((r) => r.check?.status === 'needsCheck' && r.check.reason === 'DUPLICATE')).toBe(true);
  });

  it('등록된 스타일이 없으면 대상이 없다(구역을 그리지 않음)', () => {
    const { checkable, duplicates } = buildSupplementRows([style('X')], { X: false });
    expect(checkable).toHaveLength(0);
    expect(duplicates).toHaveLength(0);
  });

  const rows = (): SupplementRow[] => [
    { key: 'A', styleNo: 'A', style: style('A'), check: { status: 'eligible' } },
    { key: 'B', styleNo: 'B', style: style('B'), check: { status: 'alreadyHas' } },
    { key: 'C', styleNo: 'C', style: style('C'), check: { status: 'needsCheck', reason: 'CALL_FAILED' } },
    { key: 'D', styleNo: 'D', style: style('D'), check: { status: 'eligible' } },
    { key: 'E', styleNo: 'E', style: style('E') },
  ];

  it('기본 선택은 없고, 보충 가능한 행만 선택할 수 있으며, 전체 선택도 보충 가능만 고른다', () => {
    const done = new Set<string>();
    expect(selectAllEligible(rows(), done)).toEqual(new Set(['A', 'D']));
    expect(isSelectable(rows()[1], done, 'B')).toBe(false);
    expect(isSelectable(rows()[2], done, 'C')).toBe(false); // 확인 필요는 선택 불가
    expect(isSelectable(rows()[4], done, 'E')).toBe(false); // 점검 전은 선택 불가
    let sel = new Set<string>();
    sel = toggleSelection(sel, rows(), done, 'B');
    expect(sel.size).toBe(0);
    sel = toggleSelection(sel, rows(), done, 'A');
    expect([...sel]).toEqual(['A']);
    sel = toggleSelection(sel, rows(), done, 'A');
    expect(sel.size).toBe(0);
  });

  it('보충 완료된 스타일은 다시 선택·실행되지 않는다(중복 전송 방지)', () => {
    const done = new Set(['A']);
    expect(selectAllEligible(rows(), done)).toEqual(new Set(['D']));
    expect(runnableTargets(rows(), new Set(['A', 'D']), done).map((r) => r.key)).toEqual(['D']);
    expect(toggleSelection(new Set(['A']), rows(), done, 'A').has('A')).toBe(false);
  });

  it('실행 대상은 선택된 것 중 지금도 선택 가능한 것뿐이다', () => {
    expect(runnableTargets(rows(), new Set(['A', 'B', 'C', 'Z']), new Set()).map((r) => r.key)).toEqual(['A']);
  });
});

describe('previewOuterRow — 추가될 겉감 행 미리보기 (PR-259)', () => {
  it('서버가 알려 준 인덱스의 구분·자재명·요척을 한 줄로 정리해 읽는다', () => {
    expect(previewOuterRow(style('S'), 0)).toEqual({ category: '겉감 OUT-SHELL', itemName: '겉감 OUT-SHELL', consumption: '1.2' });
  });
  it('인덱스가 범위 밖·이상하면 미리보기 없음(null)', () => {
    for (const i of [undefined, -1, 5, 1.5, NaN]) expect(previewOuterRow(style('S'), i as number)).toBeNull();
    expect(previewOuterRow({ sheetName: 's', styleNo: 'S' }, 0)).toBeNull();
  });
});

describe('runSupplementQueue — 순차·실패 격리·서버 오류 연속 중단 (PR-259)', () => {
  const mk = (n: number): SupplementRow[] => Array.from({ length: n }, (_, i) => ({ key: `K${i}`, styleNo: `S${i}`, style: style(`S${i}`), check: { status: 'eligible' as const } }));
  const ok = { eligible: true, applied: true };
  const err500 = Object.assign(new Error('x'), { response: { status: 500 } });

  it('한 번에 하나씩 순차로 호출하고(동시 실행 없음) 호출 순서가 입력 순서와 같다', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const { outcomes } = await runSupplementQueue(mk(4), async (row) => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(row.styleNo);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return ok;
    });
    expect(maxActive).toBe(1);
    expect(order).toEqual(['S0', 'S1', 'S2', 'S3']);
    expect(outcomes.every((o) => o.result.kind === 'added')).toBe(true);
  });

  it('한 건이 실패(예외·applied:false·형식 이상)해도 다음 건을 계속 실행하고 applied:true 만 성공으로 센다', async () => {
    const replies: unknown[] = [ok, { eligible: true, applied: false }, new Error('net'), {}, ok];
    const { outcomes, aborted } = await runSupplementQueue(mk(5), async (_row) => {
      const r = replies.shift();
      if (r instanceof Error) throw r;
      return r;
    });
    expect(aborted).toBe(false);
    expect(outcomes.map((o) => o.result.kind)).toEqual(['added', 'failed', 'failed', 'failed', 'added']);
    expect(summarizeRun(outcomes.map((o) => o.result))).toEqual({ added: 2, alreadyHas: 0, notEligible: 0, failed: 3 });
  });

  it('서버 오류(5xx)가 연속 2회면 남은 스타일은 호출하지 않고 notRun 으로 표시한다', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce(err500)
      .mockRejectedValueOnce(err500)
      .mockResolvedValue(ok);
    const { outcomes, aborted } = await runSupplementQueue(mk(6), run);
    expect(aborted).toBe(true);
    expect(run).toHaveBeenCalledTimes(3);
    expect(outcomes.map((o) => o.result.kind)).toEqual(['added', 'serverError', 'serverError', 'notRun', 'notRun', 'notRun']);
  });

  it('서버 오류가 연속이 아니면(중간에 성공) 중단하지 않는다', async () => {
    const run = vi.fn().mockRejectedValueOnce(err500).mockResolvedValueOnce(ok).mockRejectedValueOnce(err500).mockResolvedValue(ok);
    const { outcomes, aborted } = await runSupplementQueue(mk(4), run);
    expect(aborted).toBe(false);
    expect(run).toHaveBeenCalledTimes(4);
    expect(outcomes.map((o) => o.result.kind)).toEqual(['serverError', 'added', 'serverError', 'added']);
  });

  it('성공한 스타일을 다음 실행 대상에서 빼면 재전송되지 않는다(done 키 반영)', async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const rows = mk(3);
    const first = await runSupplementQueue(runnableTargets(rows, new Set(['K0', 'K1']), new Set()), run);
    const done = new Set(first.outcomes.filter((o) => o.result.kind === 'added').map((o) => o.row.key));
    expect(run).toHaveBeenCalledTimes(2);
    expect(runnableTargets(rows, new Set(['K0', 'K1', 'K2']), done).map((r) => r.key)).toEqual(['K2']);
  });

  it('진행 콜백이 건마다 호출된다', async () => {
    const seen: string[] = [];
    await runSupplementQueue(mk(3), async () => ok, (done, total, o) => seen.push(`${done}/${total}:${o.row.styleNo}`));
    expect(seen).toEqual(['1/3:S0', '2/3:S1', '3/3:S2']);
  });
});

describe('요약·문구 (PR-259)', () => {
  it('요약 문구와 집계', () => {
    const results: RunResult[] = [{ kind: 'added' }, { kind: 'added' }, { kind: 'alreadyHas' }, { kind: 'ineligible', reason: 'OTHER_CHANGES' }, { kind: 'failed' }, { kind: 'serverError' }, { kind: 'notRun' }];
    const s = summarizeRun(results);
    expect(s).toEqual({ added: 2, alreadyHas: 1, notEligible: 1, failed: 3 });
    expect(formatRunSummary(s)).toBe('성공 2 · 이미 겉감 있음 1 · 다른 변경 있음/보충 불가 1 · 실패(확인 필요) 3');
  });
  it('확인창 문구와 결과 설명', () => {
    expect(buildConfirmMessage(3)).toBe('선택한 3개 스타일에 겉감 행을 1개씩 추가합니다. 스타일 정보·오더개요·선적일·계약·기존 자재 행은 바뀌지 않습니다. 계속할까요?');
    expect(describeRunResult({ kind: 'added' })).toBe('겉감 행 추가됨');
    expect(describeRunResult({ kind: 'serverError', reason: 'HTTP_500', at: '2026-01-01T00:00:00.000Z' })).toContain('서버 오류 — 관리자에게 알려 주세요');
    expect(describeRunResult({ kind: 'failed', reason: 'TIMEOUT' })).toContain('시간이 초과');
  });
});

describe('점검 결과는 저장소에 넣지 않는다 (PR-259)', () => {
  it('새 화면·로직 파일이 sessionStorage/localStorage 를 쓰지 않는다', () => {
    for (const raw of [logicSrc, panelSrc]) {
      const src = raw.replace(/\/\/.*$/gm, ''); // 주석은 제외하고 코드만 본다
      expect(src).not.toMatch(/sessionStorage|localStorage|saveUploadReview/);
    }
  });
});
