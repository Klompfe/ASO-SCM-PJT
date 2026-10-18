import { classifyBomItems } from './scoring/bom-match';
import { mergeFaceColorSplits } from './scoring/face-split';
import { scoreStyleNo, aggregateConfusionPairs } from './scoring/style-field';
import { identifyUnstableFields, type InstabilityResult } from './scoring/instability';
import { findGoldenBySheetName } from './golden-extract.util';
import type { EvalMode, GoldenStyle, AiResultLike, FieldErrorType, StyleNoErrorType, EntryAlignmentStatus, DigitConfusionPair } from './types';

// PR-199b: 라이브 실행(runEvalMode)과 --rescore(저장된 응답 재채점)가 공유하는 채점
// 집계 로직 — "어떻게 그 AI 응답을 얻었는지"와 무관하게 같은 방식으로 센다.
export interface ScoredEntry {
  mode: EvalMode | string;
  model: string;
  pdf: string;
  page: number;
  sheet: string;
  run: number;
  status: EntryAlignmentStatus;
  ai: AiResultLike | null;
}

const BOM_COUNT_KEYS: FieldErrorType[] = [
  'OK', 'VALUE_DIFF', 'VALUE_MISSING', 'NAME_DIFF', 'NAME_ABBREV',
  'EXTRA_DUPLICATE', 'EXTRA_OTHER', 'EXTRA_HEADER_MATERIAL', 'MISSING',
  'SUPPLIER_MERGED', 'SUPPLIER_NAME_DIFF', 'ITEM_CODE_DIGIT_DIFF', 'FACE_SPLIT_BY_COLOR',
];
const STYLE_COUNT_KEYS: StyleNoErrorType[] = ['EXACT', 'SUFFIX_MISSING', 'SUFFIX_DIGIT', 'OTHER_MISMATCH'];

export interface AlignmentIssue {
  mode: string;
  model: string;
  pdf: string;
  page: number;
  sheet: string;
  status: EntryAlignmentStatus;
}

export interface SummaryData {
  callCountByModeModel: { mode: string; model: string; count: number }[];
  bomCounts: Record<string, number>;
  styleNoCounts: Record<string, number>;
  confusionTable: { golden: string; read: string; count: number }[];
  alignmentIssues: AlignmentIssue[];
  sheetNotFound: { pdf: string; page: number; sheet: string }[];
  unstableFields: InstabilityResult[];
  faceSplitCount: number;
}

function emptyRecord<T extends string>(keys: T[]): Record<T, number> {
  return keys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<T, number>);
}

// 불안정 — 같은 (mode,model,pdf,page)를 여러 run으로 호출했을 때 styleNo가 흔들리는지.
function buildInstabilityInputs(entries: ScoredEntry[]) {
  const byKey = new Map<string, (string | null)[]>();
  for (const e of entries) {
    const key = `${e.mode}/${e.model}/${e.pdf}/page${e.page}(${e.sheet}) styleNo`;
    const list = byKey.get(key) ?? [];
    list.push(e.ai?.overview?.styleNo ?? null);
    byKey.set(key, list);
  }
  return [...byKey.entries()].map(([fieldKey, valuesByRun]) => ({ fieldKey, valuesByRun }));
}

export function buildSummaryData(entries: ScoredEntry[], golden: GoldenStyle[]): SummaryData {
  const callCountMap = new Map<string, number>();
  const bomCounts = emptyRecord(BOM_COUNT_KEYS);
  const styleNoCounts = emptyRecord(STYLE_COUNT_KEYS);
  const confusionPairs: DigitConfusionPair[] = [];
  const alignmentIssues: AlignmentIssue[] = [];
  const sheetNotFoundKeys = new Set<string>();
  const sheetNotFound: { pdf: string; page: number; sheet: string }[] = [];
  let faceSplitCount = 0;

  for (const e of entries) {
    const key = `${e.mode}\u0000${e.model}`;
    callCountMap.set(key, (callCountMap.get(key) ?? 0) + 1);

    if (e.status === 'SHEET_NOT_FOUND') {
      // 같은 (pdf,page,sheet)는 실행 회차(run)마다 반복되므로 목록에는 한 번만 남긴다.
      const key = `${e.pdf}\u0000${e.page}\u0000${e.sheet}`;
      if (!sheetNotFoundKeys.has(key)) {
        sheetNotFoundKeys.add(key);
        sheetNotFound.push({ pdf: e.pdf, page: e.page, sheet: e.sheet });
      }
      continue;
    }
    if (e.status === 'PAGE_COUNT_MISMATCH' || e.status === 'ALIGNED_BY_STYLE') {
      alignmentIssues.push({ mode: e.mode, model: e.model, pdf: e.pdf, page: e.page, sheet: e.sheet, status: e.status });
      if (e.status === 'PAGE_COUNT_MISMATCH') continue; // 짝지은 AI 값이 없어 채점 불가
    }
    if (!e.ai) continue;

    const g = findGoldenBySheetName(golden, e.sheet);
    if (!g) continue;

    if (g.styleNo) {
      const styleScore = scoreStyleNo(g.styleNo, e.ai.overview?.styleNo ?? null);
      styleNoCounts[styleScore.type]++;
      if (styleScore.confusion) confusionPairs.push(styleScore.confusion);
    }

    const rawResults = classifyBomItems(g.bomItems, e.ai.bomItems ?? []);
    const { results: mergedResults, faceSplitCount: fsCount } = mergeFaceColorSplits(rawResults);
    faceSplitCount += fsCount;
    for (const br of mergedResults) {
      if (br.type in bomCounts) bomCounts[br.type]++;
    }
  }

  const unstableFields = identifyUnstableFields(buildInstabilityInputs(entries));

  return {
    callCountByModeModel: [...callCountMap.entries()].map(([key, count]) => {
      const [mode, model] = key.split('\u0000');
      return { mode, model, count };
    }),
    bomCounts,
    styleNoCounts,
    confusionTable: aggregateConfusionPairs(confusionPairs),
    alignmentIssues,
    sheetNotFound,
    unstableFields,
    faceSplitCount,
  };
}

export function renderSummaryMarkdown(data: SummaryData): string {
  const lines: string[] = ['# vision-eval summary\n'];

  lines.push('## 조용한 오류(틀렸지만 신뢰할 수 있는 값으로 나온 것)');
  lines.push('> 신호 평가는 --pilot 실행 후 signals.ts 결과를 사람이 해석해 이 자리에 채운다.\n');

  lines.push('## 모드별 호출 수');
  for (const c of data.callCountByModeModel) lines.push(`- 모드 ${c.mode} / 모델 ${c.model}: ${c.count}건`);

  lines.push('\n## 자재명세 오류 유형별 건수');
  for (const [type, count] of Object.entries(data.bomCounts)) lines.push(`- ${type}: ${count}`);
  lines.push(`- FACE_SPLIT_BY_COLOR로 합쳐진 건수: ${data.faceSplitCount}`);

  lines.push('\n## 스타일번호 오류 유형별 건수');
  for (const [type, count] of Object.entries(data.styleNoCounts)) lines.push(`- ${type}: ${count}`);

  if (data.confusionTable.length > 0) {
    lines.push('\n## 끝 글자 혼동표 (정답 → 읽은 값)');
    for (const pair of data.confusionTable) lines.push(`- ${pair.golden} → ${pair.read}: ${pair.count}건`);
  }

  if (data.alignmentIssues.length > 0) {
    lines.push('\n## 정렬 신뢰도 문제(모드 A — 배열 길이 불일치)');
    for (const i of data.alignmentIssues) lines.push(`- [${i.status}] ${i.mode}/${i.model} ${i.pdf} page${i.page}(${i.sheet})`);
  }

  if (data.sheetNotFound.length > 0) {
    lines.push('\n## 정답 시트 없음(SHEET_NOT_FOUND — 집계 제외)');
    for (const s of data.sheetNotFound) lines.push(`- ${s.pdf} page${s.page}: 시트 "${s.sheet}" 없음`);
  }

  if (data.unstableFields.length > 0) {
    lines.push('\n## 불안정 필드(반복 실행 간 값이 바뀜)');
    for (const f of data.unstableFields) lines.push(`- ${f.fieldKey}: 서로 다른 값 ${f.distinctValueCount}종, 불안정도 ${(f.instabilityRate * 100).toFixed(0)}%`);
  }

  return lines.join('\n');
}
