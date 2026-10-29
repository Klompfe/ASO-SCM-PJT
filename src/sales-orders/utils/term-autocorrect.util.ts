// PR-208: 작지 AI가 읽은 자재명의 "품목군"(괄호 앞부분) 자모 오독을 정적 사전
// (CATEGORY_VOCAB) 기준으로 자동 교정한다. 괄호 안 세부·뒤에 오는 코드는 건드리지
// 않는다. 자동 교정은 후보가 정확히 1개이고 자모 편집거리 ≤ 1일 때만 한다 —
// 그 밖에는 경고만 남기고 값은 바꾸지 않는다(이 저장소의 "추측해서 바꾸지 않는다"
// 원칙, PR-197/200과 동일).
import { CATEGORY_VOCAB } from './category-vocab.constants';

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;

// 한글 음절을 초성·중성·종성(종성 없으면 생략)으로 풀어 배열로 돌려준다. 한글이 아닌
// 글자는 그대로 한 칸을 차지한다(영문·숫자·기호가 섞인 이름도 거리 계산이 가능하게).
export function decomposeJamo(s: string): string[] {
  const out: string[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
      const off = code - HANGUL_SYLLABLE_START;
      const cho = Math.floor(off / 588);
      const jung = Math.floor((off % 588) / 28);
      const jong = off % 28;
      out.push(CHO[cho], JUNG[jung]);
      if (JONG[jong]) out.push(JONG[jong]);
    } else {
      out.push(ch);
    }
  }
  return out;
}

// 자모로 풀어낸 배열 위의 레벤슈타인 거리 — 한글은 받침 하나·모음 하나 차이가 거리 1로
// 잡힌다(음절 전체를 한 글자로 보는 비교보다 더 세밀함).
export function jamoDistance(a: string, b: string): number {
  const x = decomposeJamo(a);
  const y = decomposeJamo(b);
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[x.length][y.length];
}

export interface CategoryExtraction {
  // 자재명에서 첫 "(" 앞부분(원문 그대로, 트림 안 함) — 품목군. 괄호가 없으면 이름 전체.
  category: string;
  // "(" 부터 끝까지(세부·뒤에 오는 코드 포함, 원문 그대로) — 없으면 빈 문자열.
  rest: string;
}

export function extractCategory(itemName: string): CategoryExtraction {
  const idx = itemName.indexOf('(');
  if (idx === -1) return { category: itemName, rest: '' };
  return { category: itemName.slice(0, idx), rest: itemName.slice(idx) };
}

const HANGUL_ONLY = /^[가-힣]+$/;
const MIN_CORRECTABLE_LENGTH = 3;

export interface CategoryCorrectionResult {
  kind: 'unchanged' | 'corrected' | 'ambiguous' | 'unknown';
  // corrected일 때만: 품목군 원문(트림됨) → 사전 표기.
  from?: string;
  to?: string;
  // ambiguous(거리<=1 후보 2개 이상) 또는 unknown(거리<=2 후보, 최대 3개)일 때만.
  candidates?: string[];
}

// 품목군(괄호 앞)만 비교 대상으로 삼는다 — 공백 제거 후 사전과 정확히 일치하면
// unchanged, 한글로만 이루어진 3글자 이상일 때만 거리<=1 후보를 찾는다(2글자 이하는
// 오탐 위험이 커서 교정 후보 자체를 찾지 않는다, PILOT-12 결정). 후보가 정확히 1개면
// corrected, 2개 이상이면 ambiguous(교정 안 함), 0개면 unknown(참고용 후보만 덧붙임).
export function suggestCategoryCorrection(
  itemName: string,
  vocab: readonly string[] = CATEGORY_VOCAB,
): CategoryCorrectionResult {
  const { category } = extractCategory(itemName);
  const trimmed = category.trim();
  const normalized = trimmed.replace(/\s+/g, '');

  if (vocab.includes(normalized)) return { kind: 'unchanged' };
  if (!HANGUL_ONLY.test(normalized)) return { kind: 'unknown' };
  if (normalized.length < MIN_CORRECTABLE_LENGTH) return { kind: 'unknown' };

  const correctable = vocab.filter((v) => v.length >= MIN_CORRECTABLE_LENGTH);
  const within1 = correctable.filter((v) => jamoDistance(v, normalized) <= 1);

  if (within1.length === 1) return { kind: 'corrected', from: trimmed, to: within1[0] };
  if (within1.length >= 2) return { kind: 'ambiguous', candidates: within1 };

  const within2 = correctable.filter((v) => jamoDistance(v, normalized) <= 2).slice(0, 3);
  return within2.length > 0 ? { kind: 'unknown', candidates: within2 } : { kind: 'unknown' };
}

// 교정 결과를 실제 itemName에 적용한다 — 품목군 조각만 사전 표기로 바꾸고, 괄호
// 세부·뒤에 오는 코드(rest)는 원문 그대로 둔다. corrected가 아니면 원문을 그대로
// 돌려준다(호출부에서 kind를 먼저 확인하지 않아도 안전하게 쓸 수 있게).
export function applyCategoryCorrection(itemName: string, result: CategoryCorrectionResult): string {
  if (result.kind !== 'corrected' || !result.to) return itemName;
  const { rest } = extractCategory(itemName);
  return `${result.to}${rest}`;
}
