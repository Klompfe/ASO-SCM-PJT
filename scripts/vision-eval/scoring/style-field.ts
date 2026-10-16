import type { StyleNoErrorType, DigitConfusionPair } from '../types';

export interface StyleNoScoreResult {
  type: StyleNoErrorType;
  // SUFFIX_DIGIT일 때만: 정답 끝 글자(영문) → AI가 읽은 끝 글자(숫자).
  confusion: DigitConfusionPair | null;
}

// PR-199: 스타일번호 채점 — 정확 / 끝 영문자 누락(SUFFIX_MISSING, 기존 분류) / 끝 글자를
// 숫자로 오독(SUFFIX_DIGIT, 보완) / 그 외 불일치로 나눈다. 두 분류는 서로 다른 오류라
// 섞지 않는다(SUFFIX_MISSING은 PR-191의 "끝 글자만 다른 기존 스타일" 경고와 같은
// 패턴이고, SUFFIX_DIGIT은 Gemini가 글자를 숫자로 잘못 읽는 별도 현상이다).
export function scoreStyleNo(golden: string, read: string | null): StyleNoScoreResult {
  const g = golden.trim().toUpperCase();
  const r = (read ?? '').trim().toUpperCase();

  if (!r) return { type: 'OTHER_MISMATCH', confusion: null };
  if (r === g) return { type: 'EXACT', confusion: null };

  if (g.startsWith(r)) {
    const suffix = g.slice(r.length);
    if (suffix.length >= 1 && suffix.length <= 2 && /^[A-Z]+$/.test(suffix)) {
      return { type: 'SUFFIX_MISSING', confusion: null };
    }
  }

  if (g.length === r.length) {
    let i = 0;
    while (i < g.length && g[i] === r[i]) i++;
    const gSuffix = g.slice(i);
    const rSuffix = r.slice(i);
    if (
      gSuffix.length >= 1 &&
      gSuffix.length <= 2 &&
      gSuffix.length === rSuffix.length &&
      /^[A-Z]+$/.test(gSuffix) &&
      /^[0-9]+$/.test(rSuffix)
    ) {
      return { type: 'SUFFIX_DIGIT', confusion: { golden: gSuffix, read: rSuffix } };
    }
  }

  return { type: 'OTHER_MISMATCH', confusion: null };
}

// 혼동표: 정답 끝 글자 → 읽은 숫자별 건수. (Z→3, Z→2, A→4 ...) PR-200 프롬프트 규칙의 근거.
export function aggregateConfusionPairs(pairs: DigitConfusionPair[]): { golden: string; read: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = `${p.golden}\u0000${p.read}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [golden, read] = key.split('\u0000');
      return { golden, read, count };
    })
    .sort((a, b) => b.count - a.count);
}
