// PR-199: 작성일/납기 채점 — 월/일 일치 여부와 연도 일치 여부를 따로 본다(연도가 안
// 보이는 손글씨 표기가 실무에서 흔해 월/일만 맞아도 "읽기는 맞았다"로 구분해야 한다).
export interface ParsedMonthDay {
  year: number | null;
  month: number;
  day: number;
}

export function parseMonthDay(value: string): ParsedMonthDay | null {
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const korean = trimmed.match(/^(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (korean) {
    const y = Number(korean[1]);
    return { year: y < 100 ? 2000 + y : y, month: Number(korean[2]), day: Number(korean[3]) };
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const y = slash[3] ? Number(slash[3]) : null;
    return { year: y != null ? (y < 100 ? 2000 + y : y) : null, month: Number(slash[1]), day: Number(slash[2]) };
  }

  return null;
}

export interface DateFieldScore {
  monthDayMatch: boolean;
  // 둘 중 하나라도 연도를 모르면 null(비교 불가 — 틀렸다고 단정하지 않음).
  yearMatch: boolean | null;
}

export function scoreDateField(golden: string | null, read: string | null): DateFieldScore {
  if (!golden || !read) return { monthDayMatch: false, yearMatch: null };
  const g = parseMonthDay(golden);
  const r = parseMonthDay(read);
  if (!g || !r) return { monthDayMatch: false, yearMatch: null };
  return {
    monthDayMatch: g.month === r.month && g.day === r.day,
    yearMatch: g.year != null && r.year != null ? g.year === r.year : null,
  };
}
