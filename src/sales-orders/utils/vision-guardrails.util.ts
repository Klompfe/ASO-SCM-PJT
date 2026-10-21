// PR-200: 작지 AI 판독 안전장치 — 순수 함수만(DB/네트워크 없음). vision.service.ts가
// AI 응답을 받은 뒤 이 함수들로 경고를 "붙이기만" 한다(값을 바꾸는 건 대소문자 정리와
// "공급사)자재명" 분리 두 가지뿐 — 둘 다 형식 해석이지 내용 추측이 아니다).

export interface VisionWarning {
  code: string;
  message: string;
  suggestions?: string[];
}

// 완성 시트 118개 실측(PR-200 배경) 기준: 접두 MB/MBS/LB/VB + 영숫자 2자 + 영문 3자
// (품목코드) + 숫자 3자리 + 끝 영문 1자. 끝에 "-숫자"(옵션 구분)가 붙을 수 있다.
export const STYLE_NO_FORMAT_REGEX = /^(MBS?|LB|VB)[0-9A-Z]{2}[A-Z]{3}\d{3}[A-Z](-\d+)?$/;
// 끝 글자가 숫자인 경우(끝 영문자가 통째로 숫자로 오독된 경우) — 사용자 확인: 끝 글자는
// 절대 숫자가 아니다. 이 패턴은 "-숫자" 옵션 구분자가 없는 기본형만 본다.
export const STYLE_NO_LAST_DIGIT_REGEX = /^(MBS?|LB|VB)[0-9A-Z]{2}[A-Z]{3}\d{4}$/;
// 사용자 추산 빈도순(Z 약 80%, A·R·K 합쳐 약 10%, D 약 5%, P 약 3%, C·F 각 약 1%).
export const STYLE_NO_SUFFIX_LETTERS = ['Z', 'A', 'R', 'K', 'D', 'P', 'C', 'F'] as const;

// 위치별 혼동 문자 치환표 — 영문 자리에 숫자가 보이면(숫자→영문), 숫자 자리에 영문이
// 보이면(영문→숫자) 적용한다. 서버는 이 표로 "형식을 통과하는 후보"만 만들고 값을 바꾸지
// 않는다(사람이 칩을 눌러야 반영).
export const STYLE_NO_CONFUSABLES = {
  digitToLetter: { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '4': 'A', '6': 'G' } as Record<string, string>,
  letterToDigit: { O: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' } as Record<string, string>,
};

const STYLE_NO_PREFIXES = ['MBS', 'MB', 'LB', 'VB']; // MBS를 MB보다 먼저 검사(접두 겹침).

type CharClass = 'alnum' | 'letter' | 'digit';
const REST_CLASSES: CharClass[] = ['alnum', 'alnum', 'letter', 'letter', 'letter', 'digit', 'digit', 'digit', 'letter'];

function classOk(ch: string, cls: CharClass): boolean {
  if (cls === 'alnum') return /[0-9A-Z]/.test(ch);
  if (cls === 'letter') return /[A-Z]/.test(ch);
  return /[0-9]/.test(ch);
}

// 대소문자만 다른 경우에만 "정리"로 허용한다(그 외 형식 문제는 고치지 않음) — 대문자로
// 바꿨을 때 비로소 형식을 통과해야 "대소문자만의 문제"였다고 판단한다.
export function normalizeStyleNoCase(raw: string): { styleNo: string; rawStyleNo: string } | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (!/[a-z]/.test(trimmed)) return null;
  const upper = trimmed.toUpperCase();
  if (STYLE_NO_FORMAT_REGEX.test(trimmed)) return null; // 이미 통과(소문자가 있어도 정규식이 대소문자 구분 없이 봐야 하면 여기로 안 옴 — 현재 정규식은 대문자 전용이라 소문자 섞이면 항상 통과 못 함)
  if (!STYLE_NO_FORMAT_REGEX.test(upper)) return null;
  return { styleNo: upper, rawStyleNo: trimmed };
}

// 접두(MB/MBS/LB/VB) + 나머지 9자로 나눌 수 있을 때만 위치별 혼동 문자 치환 후보를
// 만든다(나눌 수 없으면 — 하이픈이 섞이거나 길이가 깨진 경우 — 후보 없이 빈 배열).
export function generateStyleNoCandidates(raw: string, knownStyleNos: string[] = []): string[] {
  const trimmed = (raw ?? '').trim().toUpperCase();
  if (!trimmed) return [];
  const suffixMatch = trimmed.match(/^(.*?)(-\d+)?$/);
  const core = suffixMatch ? suffixMatch[1] : trimmed;
  const tailSuffix = suffixMatch?.[2] ?? '';

  let prefix: string | null = null;
  let rest = '';
  for (const p of STYLE_NO_PREFIXES) {
    if (core.startsWith(p)) { prefix = p; rest = core.slice(p.length); break; }
  }
  if (!prefix || rest.length !== 9) return [];

  const chars = rest.split('');
  const mismatches: number[] = [];
  chars.forEach((ch, i) => { if (!classOk(ch, REST_CLASSES[i])) mismatches.push(i); });
  if (mismatches.length === 0 || mismatches.length > 2) return [];

  function substitutionsFor(ch: string, cls: CharClass): string[] {
    if (cls === 'digit') return STYLE_NO_CONFUSABLES.letterToDigit[ch] ? [STYLE_NO_CONFUSABLES.letterToDigit[ch]] : [];
    if (/[0-9]/.test(ch)) return STYLE_NO_CONFUSABLES.digitToLetter[ch] ? [STYLE_NO_CONFUSABLES.digitToLetter[ch]] : [];
    return [];
  }

  function buildCombos(idx: number, current: string[]): string[][] {
    if (idx === mismatches.length) return [current.slice()];
    const pos = mismatches[idx];
    const subs = substitutionsFor(chars[pos], REST_CLASSES[pos]);
    if (subs.length === 0) return [];
    const out: string[][] = [];
    for (const s of subs) {
      current[pos] = s;
      out.push(...buildCombos(idx + 1, current));
    }
    return out;
  }

  const candidates = new Set<string>();
  for (const combo of buildCombos(0, chars.slice())) {
    const candidate = prefix + combo.join('') + tailSuffix;
    if (STYLE_NO_FORMAT_REGEX.test(candidate)) candidates.add(candidate);
  }

  const known = new Set(knownStyleNos.map((s) => s.trim().toUpperCase()));
  return [...candidates].sort((a, b) => (known.has(b) ? 1 : 0) - (known.has(a) ? 1 : 0)).slice(0, 3);
}

// 끝 글자가 숫자인 스타일번호에서 "끝 글자 자리를 빈도순 영문자로 바꾼" 후보를 만든다.
// 뒤의 숫자가 4면(손글씨 A가 4로 보이는 패턴) A를 맨 앞으로.
export function generateLastDigitSuggestions(styleNo: string): string[] {
  const base = styleNo.slice(0, -1);
  const lastDigit = styleNo.slice(-1);
  const order = lastDigit === '4' ? ['A', ...STYLE_NO_SUFFIX_LETTERS.filter((l) => l !== 'A')] : [...STYLE_NO_SUFFIX_LETTERS];
  return order.map((l) => base + l).filter((cand) => STYLE_NO_FORMAT_REGEX.test(cand));
}

export interface StyleNoCheckResult {
  styleNo: string | null;
  rawStyleNo: string | null;
  warnings: VisionWarning[];
}

// 스타일번호 전체 검사 파이프라인. 값은 "대소문자 정리"일 때만 바꾸고, 나머지는 경고와
// 후보만 붙인다(서버는 값을 바꾸지 않는다).
export function checkStyleNo(raw: string | null, knownStyleNos: string[] = []): StyleNoCheckResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { styleNo: raw, rawStyleNo: null, warnings: [] };

  const caseNorm = normalizeStyleNoCase(trimmed);
  const styleNo = caseNorm ? caseNorm.styleNo : trimmed;
  const rawStyleNo = caseNorm ? caseNorm.rawStyleNo : null;
  const warnings: VisionWarning[] = [];
  if (caseNorm) {
    warnings.push({ code: 'STYLE_NO_CASE_NORMALIZED', message: `소문자를 대문자로 정리했습니다(원문: ${caseNorm.rawStyleNo})` });
  }

  const upper = styleNo.toUpperCase();
  if (!STYLE_NO_FORMAT_REGEX.test(upper)) {
    if (STYLE_NO_LAST_DIGIT_REGEX.test(upper)) {
      warnings.push({
        code: 'STYLE_NO_LAST_DIGIT',
        message: '스타일번호 끝 글자가 숫자로 읽혔습니다 — 끝 글자는 숫자가 될 수 없습니다. 원본과 대조해 영문자로 고쳐 주세요',
        suggestions: generateLastDigitSuggestions(upper),
      });
    } else {
      warnings.push({
        code: 'STYLE_NO_FORMAT',
        message: '스타일번호 형식이 맞지 않습니다 — 원본과 대조해 주세요',
        suggestions: generateStyleNoCandidates(upper, knownStyleNos),
      });
    }
  } else {
    const core = upper.replace(/-\d+$/, '');
    const lastLetter = core.slice(-1);
    if (!(STYLE_NO_SUFFIX_LETTERS as readonly string[]).includes(lastLetter)) {
      warnings.push({ code: 'STYLE_NO_RARE_SUFFIX', message: `끝 글자(${lastLetter})가 평소 쓰는 글자가 아닙니다 — 원본과 대조해 주세요` });
    }
  }

  return { styleNo, rawStyleNo, warnings };
}

// "공급사)자재명" 형식 분리(형식 해석 — 값을 지어내지 않고 원문을 그대로 나눔).
export function splitSupplierItemName(raw: string): { supplierName: string; itemName: string } | null {
  const match = /^([^)]+)\)\s*(.+)$/.exec((raw ?? '').trim());
  if (!match) return null;
  const supplierName = match[1].trim();
  const itemName = match[2].trim();
  if (!supplierName || !itemName) return null;
  return { supplierName, itemName };
}

// 마스터에서 "같은 길이에 정확히 한 글자만 다른" 이름을 찾는다(숫자 한 자리 오독 등).
export function findOneCharDiffCandidates(name: string, masterNames: string[]): string[] {
  const upper = (name ?? '').trim().toUpperCase();
  if (!upper) return [];
  const matched = masterNames.filter((candidate) => {
    const cu = (candidate ?? '').trim().toUpperCase();
    if (cu.length !== upper.length || cu === upper) return false;
    let diff = 0;
    for (let i = 0; i < cu.length; i++) if (cu[i] !== upper[i]) diff++;
    return diff === 1;
  });
  return [...new Set(matched)].slice(0, 3);
}

const normalizeNameForLookup = (s: string): string => (s ?? '').replace(/[\s()<>[\]]/g, '').toUpperCase();

// 자재 마스터(또는 공급업체 목록)에 없는 이름 — PR-197 "새 이름" 배지(프런트
// normalizeMaterialName)와 같은 정규화 원칙(공백·대소문자 무시)을 서버에서도 적용한다.
export function checkUnknownName(name: string | null, masterNames: string[], code = 'UNKNOWN_NAME'): VisionWarning | null {
  const normalized = normalizeNameForLookup(name ?? '');
  if (!normalized) return null;
  const known = new Set(masterNames.map(normalizeNameForLookup));
  if (known.has(normalized)) return null;
  const suggestions = findOneCharDiffCandidates(name ?? '', masterNames);
  return {
    code,
    message: '마스터에 없는 이름입니다 — 새로 등록되거나 오독일 수 있습니다',
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

// 같은 구분·규격·요척(0 초과, 1 제외)인 행이 2개 이상이면 그 행들의 인덱스를 묶어 돌려준다
// (한 줄이 여러 이름으로 중복 출력되는 패턴, PR-200 배경 1번).
export function findDuplicateGroups(
  bomItems: { category: string | null; spec: string | null; consumption: number | null }[],
): number[][] {
  const groups = new Map<string, number[]>();
  bomItems.forEach((b, i) => {
    if (b.consumption == null || b.consumption <= 0 || b.consumption === 1) return;
    const key = `${b.category ?? ''}\u0000${b.spec ?? ''}\u0000${b.consumption}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return [...groups.values()].filter((idx) => idx.length >= 2);
}

// 작성일이 미래이거나 18개월 넘게 과거면 의심 — targetRdd 연도보정(PR-190)과는 독립이고
// documentDate 값 자체는 바꾸지 않는다.
export function checkDocumentDateSuspicious(documentDate: string | null, todayIso: string): VisionWarning | null {
  if (!documentDate) return null;
  const d = new Date(documentDate);
  const today = new Date(todayIso);
  if (Number.isNaN(d.getTime()) || Number.isNaN(today.getTime())) return null;
  if (d.getTime() > today.getTime()) {
    return { code: 'DOCUMENT_DATE_SUSPICIOUS', message: '작성일이 미래로 읽혔습니다 — 원본과 대조해 주세요' };
  }
  const months18Ago = new Date(today);
  months18Ago.setMonth(months18Ago.getMonth() - 18);
  if (d.getTime() < months18Ago.getTime()) {
    return { code: 'DOCUMENT_DATE_SUSPICIOUS', message: '작성일이 18개월보다 오래된 날짜로 읽혔습니다 — 원본과 대조해 주세요' };
  }
  return null;
}

// 요척×수량과 출고량(requiredQty) 비교 — 출고량은 올림/반올림된 값일 수 있어 그 경우는
// 일치로 본다. 불일치면 "역산한 요척"이 출고량과 올림·반올림으로 맞으면 요척 후보로 준다.
// 문구는 수량이 틀렸다고 단정하지 않는다(요척 또는 수량 둘 다 의심 대상으로 표시).
export function checkYocheokMismatch(consumption: number | null, totalQty: number | null, requiredQty: number | null): VisionWarning | null {
  if (consumption == null || totalQty == null || totalQty <= 0 || requiredQty == null) return null;
  const expected = consumption * totalQty;
  if (expected === 0) return null;

  const roundMatches = (value: number): boolean =>
    Math.round(value) === requiredQty || Math.ceil(value) === requiredQty || Math.floor(value) === requiredQty || Math.abs(value - requiredQty) <= 1;

  if (roundMatches(expected)) return null;
  const pctDiff = Math.abs(expected - requiredQty) / Math.abs(expected);
  if (pctDiff <= 0.01) return null;

  const impliedConsumption = Math.round((requiredQty / totalQty) * 100) / 100;
  const impliedExpected = impliedConsumption * totalQty;
  const suggestions = roundMatches(impliedExpected) ? [String(impliedConsumption)] : undefined;

  return {
    code: 'YOCHEOK_QTY_MISMATCH',
    message: `요척 × 수량 = ${expected.toFixed(2)} 이(가) 출고량 ${requiredQty} 와 다릅니다 — 요척 또는 수량을 잘못 읽었을 수 있습니다`,
    suggestions,
  };
}
