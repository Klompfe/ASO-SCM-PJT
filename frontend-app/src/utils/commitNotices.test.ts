import { describe, expect, it } from 'vitest';
import {
  bulkSummaryText,
  commitResultHeadline,
  extractNotices,
  groupNotices,
  noticeCodeLabel,
  sortBulkResults,
  summarizeBulk,
  type CommitNotice,
} from './commitNotices';

const review = (code: CommitNotice['code'], message = `${code} 메시지`): CommitNotice => ({ type: 'NEEDS_REVIEW', code, message });
const auto = (message = '안감 혼용률 기본값'): CommitNotice => ({ type: 'AUTO_APPLIED', code: 'LINING_COMPOSITION_DEFAULT', message });

describe('commitNotices — 승인 결과 알림 로직 (PR-132)', () => {
  describe('extractNotices', () => {
    it('서버의 구조화된 notices를 그대로 쓴다', () => {
      const notices = [review('FACTORY_MISMATCH'), auto()];
      expect(extractNotices({ success: true, styleNo: 'A', notices, warnings: ['x', 'y'] })).toEqual(notices);
    });
    it('notices가 없는 응답(구버전 서버)은 warnings 문자열을 모두 "확인 필요"로 본다(정보를 숨기지 않는 쪽으로 안전하게)', () => {
      const out = extractNotices({ success: true, styleNo: 'A', warnings: ['가', '나'] });
      expect(out.map((n) => [n.type, n.message])).toEqual([['NEEDS_REVIEW', '가'], ['NEEDS_REVIEW', '나']]);
    });
    it('응답이 비었거나 이상하면 빈 배열', () => {
      expect(extractNotices(undefined)).toEqual([]);
      expect(extractNotices(null)).toEqual([]);
      expect(extractNotices({ success: true })).toEqual([]);
    });
  });

  describe('groupNotices / 문구', () => {
    it('type별로 나눈다', () => {
      const g = groupNotices([review('FACTORY_MISMATCH'), auto(), review('BOM_ITEM_VALUE_DIFF')]);
      expect(g.needsReview.map((n) => n.code)).toEqual(['FACTORY_MISMATCH', 'BOM_ITEM_VALUE_DIFF']);
      expect(g.autoApplied).toHaveLength(1);
    });
    it('코드 라벨', () => {
      expect(noticeCodeLabel('FACTORY_MISMATCH')).toBe('공장 불일치');
      expect(noticeCodeLabel('BOM_ITEM_VALUE_DIFF')).toBe('요척/필요량 차이');
      expect(noticeCodeLabel('LINING_COMPOSITION_DEFAULT')).toBe('혼용률 기본값 적용');
      expect(noticeCodeLabel('SOMETHING_NEW')).toBe('알림');
    });
    it('알림이 없으면 "자동 반영 안 된 항목이 없습니다", 정보성만 있어도 같은 문구, 확인 필요가 있으면 건수를 알린다', () => {
      expect(commitResultHeadline([])).toBe('저장되었습니다. 자동 반영 안 된 항목이 없습니다.');
      expect(commitResultHeadline([auto()])).toBe('저장되었습니다. 자동 반영 안 된 항목이 없습니다.');
      expect(commitResultHeadline([review('FACTORY_MISMATCH'), review('BOM_ITEM_VALUE_DIFF'), auto()])).toContain('자동 반영되지 않은 항목이 2건');
    });
  });

  describe('일괄승인 요약', () => {
    const results = [
      { styleNo: 'S-CLEAN', notices: [] as CommitNotice[] },
      { styleNo: 'S-AUTO', notices: [auto()] },
      { styleNo: 'S-REVIEW', notices: [review('BOM_ITEM_VALUE_DIFF'), review('FACTORY_MISMATCH')] },
      { styleNo: 'S-REVIEW2', notices: [review('BOM_ITEM_VALUE_DIFF'), auto()] },
    ];

    it('스타일 수와 "확인 필요한 차이가 있는 스타일" 수를 센다(정보성 안내만 있는 스타일은 확인 필요로 세지 않는다)', () => {
      expect(summarizeBulk(results)).toEqual({ approved: 4, withReview: 2, withAutoApplied: 2, reviewCount: 3, autoAppliedCount: 2 });
    });

    it('요약 문구: "3개 스타일 승인 완료, 그중 2개 스타일에 확인이 필요한 차이 있음"', () => {
      expect(bulkSummaryText({ approved: 3, withReview: 2, withAutoApplied: 0, reviewCount: 2, autoAppliedCount: 0 })).toBe('3개 스타일 승인 완료, 그중 2개 스타일에 확인이 필요한 차이 있음');
    });
    it('차이가 없으면 없다고 알리고, 승인된 게 없으면 그렇게 알린다', () => {
      expect(bulkSummaryText(summarizeBulk([{ styleNo: 'A', notices: [] }, { styleNo: 'B', notices: [auto()] }]))).toBe('2개 스타일 승인 완료, 확인이 필요한 차이는 없습니다.');
      expect(bulkSummaryText(summarizeBulk([]))).toBe('승인된 스타일이 없습니다.');
    });

    it('정렬: 확인 필요 → 자동 적용 → 차이 없음 순, 같은 그룹은 원래 순서 유지', () => {
      expect(sortBulkResults(results).map((r) => r.styleNo)).toEqual(['S-REVIEW', 'S-REVIEW2', 'S-AUTO', 'S-CLEAN']);
    });
    it('정렬은 원본 배열을 바꾸지 않는다', () => {
      const copy = results.map((r) => r.styleNo);
      sortBulkResults(results);
      expect(results.map((r) => r.styleNo)).toEqual(copy);
    });
  });
});
