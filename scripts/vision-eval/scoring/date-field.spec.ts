import { parseMonthDay, scoreDateField } from './date-field';

describe('parseMonthDay (PR-199)', () => {
  it('ISO 형식(YYYY-MM-DD)을 읽는다', () => {
    expect(parseMonthDay('2026-07-01')).toEqual({ year: 2026, month: 7, day: 1 });
  });
  it('한국어 표기("26년 7월 1일")를 읽고 2자리 연도는 2000년대로 보정한다', () => {
    expect(parseMonthDay('26년 7월 1일')).toEqual({ year: 2026, month: 7, day: 1 });
  });
  it('슬래시 표기("1/20")는 연도 없이 월/일만 읽는다', () => {
    expect(parseMonthDay('1/20')).toEqual({ year: null, month: 1, day: 20 });
  });
  it('알 수 없는 형식은 null', () => {
    expect(parseMonthDay('모름')).toBeNull();
  });
});

describe('scoreDateField (PR-199) — 작성일 숫자 오독(7→1) 실사례', () => {
  it('월이 다르면 monthDayMatch=false, 연도가 둘 다 있으면 yearMatch로 따로 본다', () => {
    const result = scoreDateField('26년 7월 1일', '2026-01-01');
    expect(result.monthDayMatch).toBe(false);
    expect(result.yearMatch).toBe(true);
  });

  it('월/일이 완전히 같으면 monthDayMatch=true', () => {
    expect(scoreDateField('2026-07-01', '7/1').monthDayMatch).toBe(true);
  });

  it('연도를 모르는 쪽이 있으면 yearMatch는 null(틀렸다고 단정하지 않음)', () => {
    expect(scoreDateField('2026-07-01', '7/1').yearMatch).toBeNull();
  });

  it('둘 중 하나라도 비어 있으면 monthDayMatch=false', () => {
    expect(scoreDateField(null, '2026-07-01')).toEqual({ monthDayMatch: false, yearMatch: null });
    expect(scoreDateField('2026-07-01', null)).toEqual({ monthDayMatch: false, yearMatch: null });
  });
});
