import { describe, expect, it } from 'vitest';
import {
  APPROVE_LABEL,
  BADGE_ALREADY_REGISTERED,
  BADGE_PARSE_FAILED,
  BADGE_PENDING,
  REAPPROVE_LABEL,
  REAPPROVE_NOTICE_POINTS,
  REAPPROVE_NOTICE_TITLE,
  selectBulkApproveTargets,
} from './mappingApproval';

describe('재승인 안내 문구 (PR-130)', () => {
  const all = [REAPPROVE_NOTICE_TITLE, ...REAPPROVE_NOTICE_POINTS].join('\n');

  it('오래된(PR-098 이전) 설명이 남아 있지 않다', () => {
    expect(all).not.toContain('덮어쓰기 로직은 아직 구현되지 않음');
    expect(all).not.toContain('추가로 쌓이며');
    expect(all).not.toContain('자동으로 정리되지 않습니다');
  });

  it('실제 동작(병합)을 설명한다: 중복이 쌓이지 않고 새 자재만 추가, 기존 자재 삭제 안 함', () => {
    expect(REAPPROVE_NOTICE_TITLE).toContain('병합');
    expect(REAPPROVE_NOTICE_TITLE).toContain('중복으로 쌓이지도 않습니다');
    expect(all).toContain('(자재명·색상·규격)이 같은 자재는 그대로 두고');
    expect(all).toContain('새로 나온 자재만 추가');
    expect(all).toContain('기존 자재는 삭제되지 않습니다');
  });

  it('스타일 정보는 "값이 있는 항목만 갱신, 빈 항목은 기존 유지, 공장은 예외"라고 정확히 쓴다(기존 값이 무조건 유지된다고 쓰지 않는다)', () => {
    expect(all).toContain('값이 있는 항목만 새 값으로 갱신');
    expect(all).toContain('비어 있는 항목은 기존 값이 유지');
    expect(all).toContain('공장은 기존 값이 이미 있으면 바뀌지 않습니다');
  });

  it('요척/필요량이 다른 자재는 자동 반영되지 않고, 이 화면이 차이를 알려주지 않으니 직접 확인하라고 안내한다', () => {
    expect(all).toContain('요척/필요량이 이번 파일과 다르면 자동으로 바뀌지 않습니다');
    expect(all).toContain('알려주지 않으므로');
    expect(all).not.toContain('검토 목록'); // 실제로 없는 화면을 약속하지 않는다
  });
});

describe('버튼/배지 문구 (PR-130)', () => {
  it('재승인 버튼은 실제 동작인 "병합"이고 "덮어쓰기"가 아니다', () => {
    expect(REAPPROVE_LABEL).toBe('재승인(병합)');
    expect(REAPPROVE_LABEL).not.toContain('덮어쓰기');
    expect(APPROVE_LABEL).toBe('저장 및 승인');
  });

  it('배지 문구는 그대로다', () => {
    expect(BADGE_PENDING).toBe('확인 대기');
    expect(BADGE_ALREADY_REGISTERED).toBe('이미 등록됨');
    expect(BADGE_PARSE_FAILED).toBe('파싱 실패');
  });
});

describe('selectBulkApproveTargets — 일괄승인은 신규 스타일만(동작 변경 없음, PR-130)', () => {
  const styles = [
    { styleNo: 'NEW-1' },
    { styleNo: 'EXIST-1' },
    { styleNo: 'BROKEN-1', parseError: '시트 형식 오류' },
    { styleNo: undefined },
    { styleNo: 'NEW-2' },
    { styleNo: '' },
  ];

  it('이미 등록된 스타일, 파싱 실패, styleNo 없음은 제외하고 신규만 남긴다', () => {
    const targets = selectBulkApproveTargets(styles, { 'NEW-1': false, 'EXIST-1': true, 'BROKEN-1': false, 'NEW-2': false });
    expect(targets.map((s) => s.styleNo)).toEqual(['NEW-1', 'NEW-2']);
  });

  it('existsMap에 없는(확인 실패 등) styleNo는 신규로 본다 — 기존 동작 그대로', () => {
    expect(selectBulkApproveTargets([{ styleNo: 'X' }], {}).map((s) => s.styleNo)).toEqual(['X']);
  });

  it('전부 이미 등록됐으면 대상이 0건이다(화면이 "일괄 승인할 대상이 없습니다"를 띄우는 경우)', () => {
    expect(selectBulkApproveTargets([{ styleNo: 'A' }, { styleNo: 'B' }], { A: true, B: true })).toEqual([]);
  });

  it('병합이 안전하더라도 이미 등록된 스타일을 일괄승인에 포함시키지 않는다(개별 검토 후 재승인)', () => {
    const targets = selectBulkApproveTargets([{ styleNo: 'EXIST' }], { EXIST: true });
    expect(targets).toHaveLength(0);
  });

  it('입력 순서를 유지하고 원본 객체를 그대로 돌려준다', () => {
    const a = { styleNo: 'A', overview: { factory: 'F' } };
    const b = { styleNo: 'B' };
    const targets = selectBulkApproveTargets([a, b], {});
    expect(targets[0]).toBe(a);
    expect(targets[1]).toBe(b);
  });
});
