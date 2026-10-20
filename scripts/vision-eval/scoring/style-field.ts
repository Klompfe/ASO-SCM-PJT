import type { StyleNoErrorType, DigitConfusionPair } from '../types';

export interface StyleNoScoreResult {
  type: StyleNoErrorType;
  // SUFFIX_DIGIT일 때만: 정답 끝 글자(영문) → AI가 읽은 끝 글자(숫자).
  confusion: DigitConfusionPair | null;
  // PR-199c(PILOT-3에서 확인): 정답 셀에 "FAKE0000A (끝자리 확인요망)"처럼 사람이 적은
  // 메모가 붙어 있으면 본체만 비교에 쓰고 메모는 여기 남긴다(없으면 null).
  gtNote: string | null;
}

// PR-199c: 정답 스타일번호 셀에서 "본체"만 떼어낸다 — 맨 앞 영숫자/하이픈 토큰이 본체,
// 그 뒤에 공백을 두고 이어지는 것(괄호 메모, 한글 설명 등)은 메모로 분리한다.
function splitStyleNoNote(golden: string): { body: string; note: string | null } {
  const trimmed = (golden ?? '').trim();
  const match = trimmed.match(/^([A-Za-z0-9-]+)(.*)$/s);
  if (!match) return { body: trimmed, note: null };
  const rest = match[2].trim();
  return { body: match[1], note: rest.length > 0 ? rest : null };
}

// PR-199: 스타일번호 채점 — 정확 / 끝 영문자 누락(SUFFIX_MISSING, 기존 분류) / 끝 글자를
// 숫자로 오독(SUFFIX_DIGIT, 보완) / 그 외 불일치로 나눈다. 두 분류는 서로 다른 오류라
// 섞지 않는다(SUFFIX_MISSING은 PR-191의 "끝 글자만 다른 기존 스타일" 경고와 같은
// 패턴이고, SUFFIX_DIGIT은 Gemini가 글자를 숫자로 잘못 읽는 별도 현상이다).
export function scoreStyleNo(golden: string, read: string | null): StyleNoScoreResult {
  const { body, note } = splitStyleNoNote(golden);
  const g = body.trim().toUpperCase();
  const r = (read ?? '').trim().toUpperCase();

  if (!r) return { type: 'OTHER_MISMATCH', confusion: null, gtNote: note };
  if (r === g) return { type: 'EXACT', confusion: null, gtNote: note };

  if (g.startsWith(r)) {
    const suffix = g.slice(r.length);
    if (suffix.length >= 1 && suffix.length <= 2 && /^[A-Z]+$/.test(suffix)) {
      return { type: 'SUFFIX_MISSING', confusion: null, gtNote: note };
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
      return { type: 'SUFFIX_DIGIT', confusion: { golden: gSuffix, read: rSuffix }, gtNote: note };
    }
  }

  return { type: 'OTHER_MISMATCH', confusion: null, gtNote: note };
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
