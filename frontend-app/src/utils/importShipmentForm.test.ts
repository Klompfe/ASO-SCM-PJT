import { describe, it, expect } from 'vitest';
import { dayOnly, effectiveStyleNo, isNewStyleNo, validateVoyageDates } from './importShipmentForm';

const styles = [{ styleNo: 'BF6X21C52' }, { styleNo: 'BF6X21C53' }];

describe('수입통관 등록 폼 유틸 (PR-124)', () => {
  it('선택한 값이 없으면 입력한 값(앞뒤 공백 제거)이 스타일번호다', () => {
    expect(effectiveStyleNo('', '  NEW-001 ')).toBe('NEW-001');
    expect(effectiveStyleNo('BF6X21C52', 'BF6')).toBe('BF6X21C52');
    expect(effectiveStyleNo('', '   ')).toBe('');
  });

  it('목록에 없는 값을 직접 입력하면 신규 스타일 안내, 정확히 일치하면 기존 스타일', () => {
    expect(isNewStyleNo('', 'NEW-001', [], 'NEW-001')).toBe(true);
    expect(isNewStyleNo('', 'BF6X21C52', styles, 'BF6X21C52')).toBe(false);
    expect(isNewStyleNo('', 'BF6X21', styles, 'BF6X21')).toBe(true); // 부분 일치는 기존 스타일이 아니다
    expect(isNewStyleNo('BF6X21C52', 'BF6X21C52', styles, 'BF6X21C52')).toBe(false); // 목록에서 고른 값
  });

  it('입력이 비었거나, 이 입력값에 대한 스타일 조회가 아직 끝나지 않았으면 신규라고 단정하지 않는다', () => {
    expect(isNewStyleNo('', '', [], '')).toBe(false);
    expect(isNewStyleNo('', 'NEW-001', [], 'NEW-00')).toBe(false); // 이전 입력값의 조회 결과
    expect(isNewStyleNo('', 'NEW-001', [], null)).toBe(false);
  });

  it('ETA가 ETD보다 빠르면 오류 문구, 한쪽만 있거나 같거나 늦으면 통과', () => {
    expect(validateVoyageDates('2026-07-19', '2026-07-18')).toContain('빠를 수 없습니다');
    expect(validateVoyageDates('2026-07-19', '2026-07-19')).toBeNull();
    expect(validateVoyageDates('2026-07-19', '2026-07-24')).toBeNull();
    expect(validateVoyageDates('', '2026-07-01')).toBeNull();
    expect(validateVoyageDates('2026-07-19', '')).toBeNull();
  });

  it('날짜는 ISO 문자열이어도 YYYY-MM-DD만 보여준다', () => {
    expect(dayOnly('2026-07-19T00:00:00.000Z')).toBe('2026-07-19');
    expect(dayOnly(null)).toBe('');
  });
});
