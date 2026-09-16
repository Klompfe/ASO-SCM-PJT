// PR-101: Dashboard.tsx가 먼저 쓰던 "연도+시즌 → 납기(targetRdd) 범위" 규칙을
// StylesManager.tsx의 필터도 그대로 재사용할 수 있게 공용 유틸로 뽑았다 — 별도
// 시즌 컬럼을 DB에 추가하지 않고 납기 날짜에서 파생시키는 기존 방식을 그대로 따른다.
export type Season = 'SS' | 'FW';

// SS는 납기 1~6월, FW는 납기 7~12월 — 사용자 정의 기준.
export const getSeasonDateRange = (year: number, season: Season) =>
  season === 'SS'
    ? { targetRddFrom: `${year}-01-01`, targetRddTo: `${year}-06-30` }
    : { targetRddFrom: `${year}-07-01`, targetRddTo: `${year}-12-31` };

export const currentYear = new Date().getFullYear();
export const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
