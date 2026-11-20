import { describe, it, expect, vi } from 'vitest';
import {
  parseExistsResponse,
  normalizeStyleKey,
  findDuplicateStyleKeys,
  splitBulkTargets,
  splitFailedOnlyTargets,
  approveGuarded,
  runGuardedBatch,
  countGuardedOutcomes,
  buildGuardedStatePatches,
  formatBulkApproveSummary,
  formatGuardedResultNote,
  duplicateReason,
  UNVERIFIED_REASON,
} from './excelBulkApprove';
import { applyApprovalOutcomes } from './uploadReviewStatus';

// PR-251: 엑셀 일괄 승인 보강 — 합성 값만 사용(실제 스타일번호·자재명 없음).
const sheet = (sheetName: string, styleNo: string | null, extra: Record<string, unknown> = {}) => ({ sheetName, styleNo, ...extra });

describe('parseExistsResponse — 응답을 엄격하게 해석 (fail-closed)', () => {
  it('{exists:true|false} 만 등록됨/미등록, 그 밖은 모두 unknown', () => {
    expect(parseExistsResponse({ exists: true })).toBe('registered');
    expect(parseExistsResponse({ exists: false })).toBe('unregistered');
    for (const bad of [null, undefined, {}, 'true', 1, 0, [], { exists: 'true' }, { exists: 1 }, { exists: null }, { exist: false }, { data: { exists: false } }]) {
      expect(parseExistsResponse(bad)).toBe('unknown');
    }
  });
});

describe('중복 스타일 판정 (PR-251)', () => {
  it('같은 파일 두 시트·정규화 후 동일(공백·대소문자)·다른 파일 두 건 모두 중복으로 센다', () => {
    const styles = [sheet('A1', 'S-001'), sheet('A2', 'S-001'), sheet('B1', ' s-002 '), sheet('C1', 'S-002'), sheet('D1', 'S-003')];
    const dups = findDuplicateStyleKeys(styles);
    expect([...dups.entries()].sort()).toEqual([['S-001', 2], ['S-002', 2]]);
    expect(normalizeStyleKey(' s-002 ')).toBe('S-002');
  });

  it('번호가 없거나 파싱 실패한 시트는 중복 판정에 넣지 않는다', () => {
    const dups = findDuplicateStyleKeys([sheet('A', null), sheet('B', null), sheet('C', '  '), sheet('D', 'S-1', { parseError: 'x' }), sheet('E', 'S-1', { parseError: 'x' })]);
    expect(dups.size).toBe(0);
  });
});

describe('splitBulkTargets (PR-251)', () => {
  it('정상 미등록 단건 → 승인 대상', () => {
    const split = splitBulkTargets([sheet('A', 'S-1')], {});
    expect(split.approve.map((s) => s.styleNo)).toEqual(['S-1']);
  });

  it('이미 등록됨(알고 있는 상태)은 승인 대상이 아니고 registered 로 집계', () => {
    const split = splitBulkTargets([sheet('A', 'S-1'), sheet('B', 'S-2')], { 'S-1': true, 'S-2': false });
    expect(split.registered.map((s) => s.styleNo)).toEqual(['S-1']);
    expect(split.approve.map((s) => s.styleNo)).toEqual(['S-2']);
  });

  it('배치 내 중복은 모두 일괄 제외(어느 하나도 승인 대상에 없음) — 같은 파일/다른 파일/정규화 후 동일', () => {
    const split = splitBulkTargets([sheet('A', 'S-1'), sheet('B', 's-1 '), sheet('C', 'S-2')], {});
    expect(split.approve.map((s) => s.styleNo)).toEqual(['S-2']);
    expect(split.duplicates.map((d) => d.style.sheetName).sort()).toEqual(['A', 'B']);
    expect(split.duplicates.every((d) => d.count === 2)).toBe(true);
  });

  it('번호 없음·파싱 실패는 대상이 아니다(ineligible)', () => {
    const split = splitBulkTargets([sheet('A', null), sheet('B', 'S-1', { parseError: 'boom' })], {});
    expect(split.approve).toEqual([]);
    expect(split.ineligible).toHaveLength(2);
  });

  it('중복 중 하나가 이미 등록됨으로 알려져 있어도 중복으로 먼저 분류된다(어느 것도 승인 대상 아님)', () => {
    const split = splitBulkTargets([sheet('A', 'S-1'), sheet('B', 'S-1')], { 'S-1': true });
    expect(split.approve).toEqual([]);
    expect(split.duplicates).toHaveLength(2);
  });

  it('요약 숫자 집계', () => {
    const split = splitBulkTargets(
      [sheet('A', 'S-NEW'), sheet('B', 'S-REG'), sheet('C', 'S-DUP'), sheet('D', 'S-DUP'), sheet('E', null)],
      { 'S-REG': true },
    );
    expect(formatBulkApproveSummary(split)).toBe('승인 대상 1건 / 이미 등록됨 1건 / 확인 필요(같은 스타일 중복) 2건 / 제외(파싱 실패·번호 없음) 1건');
  });
});

describe('splitFailedOnlyTargets (PR-251)', () => {
  it('실패 기록이 있는 스타일만 같은 규칙으로 분류하되 중복 판정은 배치 전체 기준', () => {
    const styles = [sheet('A', 'S-1'), sheet('B', 'S-2'), sheet('C', 'S-2'), sheet('D', 'S-3')];
    const split = splitFailedOnlyTargets(styles, { 'S-3': true }, { A: {}, B: {}, D: {} });
    expect(split.approve.map((s) => s.sheetName)).toEqual(['A']);
    expect(split.duplicates.map((d) => d.style.sheetName)).toEqual(['B']); // C 는 실패 기록이 없어 대상 밖
    expect(split.registered.map((s) => s.sheetName)).toEqual(['D']);
  });
});

describe('approveGuarded — 확인되지 않은 스타일은 승인 호출 대상이 아니다 (PR-251 핵심 회귀)', () => {
  it('미등록이 확인되면 승인 호출', async () => {
    const commit = vi.fn().mockResolvedValue('ok');
    const out = await approveGuarded('S-1', async () => ({ exists: false }), commit);
    expect(out).toEqual({ kind: 'approved', result: 'ok' });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('재확인에서 새로 등록됨 → 승인하지 않음', async () => {
    const commit = vi.fn();
    const out = await approveGuarded('S-1', async () => ({ exists: true }), commit);
    expect(out).toEqual({ kind: 'registered' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('확인 호출 실패(네트워크·서버 오류·타임아웃) → 승인하지 않음(unverified)', async () => {
    const commit = vi.fn();
    for (const err of [new Error('Network Error'), { response: { status: 500 } }, 'timeout']) {
      const out = await approveGuarded('S-1', async () => { throw err; }, commit);
      expect(out).toEqual({ kind: 'unverified' });
    }
    expect(commit).not.toHaveBeenCalled();
  });

  it('응답이 예상한 형태가 아니면(미지의 값) 승인하지 않음 — 등록됨/미등록으로 단정하지 않는다', async () => {
    const commit = vi.fn();
    for (const bad of [undefined, null, {}, 'yes', { exists: 'false' }, { exists: undefined }, 7, []]) {
      const out = await approveGuarded('S-1', async () => bad, commit);
      expect(out).toEqual({ kind: 'unverified' });
    }
    expect(commit).not.toHaveBeenCalled();
  });

  it('승인 호출이 던지면 failed(원본 오류 보존)', async () => {
    const error = new Error('validation');
    const out = await approveGuarded('S-1', async () => ({ exists: false }), async () => { throw error; });
    expect(out).toEqual({ kind: 'failed', error });
  });
});

describe('runGuardedBatch — 일괄 (PR-251)', () => {
  const styles = [
    { sheetName: 'A', styleNo: 'S-OK' },
    { sheetName: 'B', styleNo: 'S-REG' },
    { sheetName: 'C', styleNo: 'S-FAIL' },
    { sheetName: 'D', styleNo: 'S-WEIRD' },
    { sheetName: 'E', styleNo: 'S-OK2' },
  ];
  const check = async (styleNo: string) => {
    if (styleNo === 'S-REG') return { exists: true };
    if (styleNo === 'S-FAIL') throw new Error('boom');
    if (styleNo === 'S-WEIRD') return { exists: 'maybe' };
    return { exists: false };
  };

  it('확인 실패·미지의 응답·이미 등록은 승인 호출 대상에 절대 포함되지 않고, 한 스타일의 실패가 다른 스타일 승인을 막지 않는다', async () => {
    const committed: string[] = [];
    const entries = await runGuardedBatch(styles, check, async (s) => { committed.push(s.styleNo); return 'ok'; });
    expect(committed).toEqual(['S-OK', 'S-OK2']);
    expect(entries.map((e) => e.outcome.kind)).toEqual(['approved', 'registered', 'unverified', 'unverified', 'approved']);
    expect(countGuardedOutcomes(entries)).toEqual({ approved: 2, registered: 1, unverified: 2, failed: 0 });
  });

  it('승인 직전 확인은 스타일마다 승인 호출보다 먼저, 순차로 일어난다', async () => {
    const log: string[] = [];
    await runGuardedBatch(
      [{ sheetName: 'A', styleNo: 'S-1' }, { sheetName: 'B', styleNo: 'S-2' }],
      async (n) => { log.push(`check:${n}`); return { exists: false }; },
      async (s) => { log.push(`commit:${s.styleNo}`); return 1; },
    );
    expect(log).toEqual(['check:S-1', 'commit:S-1', 'check:S-2', 'commit:S-2']);
  });

  it('진행 콜백은 완료 수를 알려 준다', async () => {
    const seen: number[] = [];
    await runGuardedBatch(styles.slice(0, 3), check, async () => 1, (d) => seen.push(d));
    expect(seen).toEqual([1, 2, 3]);
  });

  it('상태 패치: 이미 등록됨은 existsMap 갱신+실패 기록 제거, 확인 실패는 별도 목록(조용히 사라지지 않음)', async () => {
    const entries = await runGuardedBatch(styles, check, async () => 1);
    const patches = buildGuardedStatePatches(entries);
    expect(patches.existsPatch).toEqual({ 'S-REG': true });
    expect(patches.clearFailureSheets).toEqual(['B']);
    expect(patches.unverifiedSheets).toEqual(['C', 'D']);
  });

  it('결과 안내 문구: 이미 등록·확인 실패 건수를 알린다(없으면 null)', () => {
    expect(formatGuardedResultNote({ approved: 1, registered: 0, unverified: 0, failed: 0 })).toBeNull();
    const note = formatGuardedResultNote({ approved: 1, registered: 2, unverified: 3, failed: 0 });
    expect(note).toContain('이미 등록된 2건은 승인하지 않았습니다');
    expect(note).toContain('확인하지 못한 3건은 승인하지 않았습니다');
  });
});

describe('실패 사유 문구와 applyApprovalOutcomes 회귀 (PR-237/251)', () => {
  it('확인 실패는 network 사유 + 재시도 안내, 중복은 개별 승인 안내', () => {
    expect(UNVERIFIED_REASON).toEqual({ kind: 'network', message: '등록 여부를 확인하지 못해 승인하지 않았습니다 — 다시 시도하세요' });
    expect(duplicateReason(3).message).toBe('같은 스타일 번호의 시트가 3건 있어 일괄 승인에서 제외했습니다 — 하나를 선택해 개별 승인하세요');
  });

  it('applyApprovalOutcomes: 성공분은 목록에서 제거, 확인 실패·중복 실패분은 목록에 유지되고 이유가 기록된다', () => {
    const styles = [{ sheetName: 'A' }, { sheetName: 'B' }, { sheetName: 'C' }];
    const out = applyApprovalOutcomes(styles, {}, [
      { sheetName: 'A', outcome: { success: true } },
      { sheetName: 'B', outcome: { success: false, reason: UNVERIFIED_REASON } },
      { sheetName: 'C', outcome: { success: false, reason: duplicateReason(2) } },
    ]);
    expect(out.styles.map((s) => s.sheetName)).toEqual(['B', 'C']);
    expect(out.failuresBySheet.B).toEqual(UNVERIFIED_REASON);
    expect(out.failuresBySheet.C.kind).toBe('validation');
  });

  it('"다시 승인"으로 재시도해 성공하면 실패 기록이 지워진다', () => {
    const out = applyApprovalOutcomes([{ sheetName: 'B' }], { B: UNVERIFIED_REASON }, [{ sheetName: 'B', outcome: { success: true } }]);
    expect(out.styles).toEqual([]);
    expect(out.failuresBySheet).toEqual({});
  });
});
