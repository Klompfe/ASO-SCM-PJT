import { classifyBomItems } from './scoring/bom-match';
import { mergeFaceColorSplits } from './scoring/face-split';
import { markImplicitMissing } from './scoring/implicit-items';
import { pairMissingWithExtraByValue } from './scoring/value-pairing';
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
  'OK', 'VALUE_DIFF', 'VALUE_MISSING', 'NAME_DIFF', 'NAME_ABBREV', 'NAME_DIFF_PAIRED_BY_VALUE',
  'EXTRA_DUPLICATE', 'EXTRA_OTHER', 'EXTRA_HEADER_MATERIAL', 'MISSING', 'MISSING_IMPLICIT',
  'SUPPLIER_MERGED', 'SUPPLIER_NAME_DIFF', 'ITEM_CODE_DIGIT_DIFF', 'FACE_SPLIT_BY_COLOR',
];
const STYLE_COUNT_KEYS: StyleNoErrorType[] = ['EXACT', 'SUFFIX_MISSING', 'SUFFIX_DIGIT', 'OTHER_MISMATCH'];
const PAGE_ROW_COLUMNS = [
  'OK', 'VALUE_DIFF', 'VALUE_MISSING', 'NAME_DIFF', 'NAME_ABBREV', 'NAME_DIFF_PAIRED_BY_VALUE',
  'EXTRA', 'MISSING', 'MISSING_IMPLICIT',
] as const;
type PageRowColumn = (typeof PAGE_ROW_COLUMNS)[number];

export interface AlignmentIssue {
  mode: string;
  model: string;
  pdf: string;
  page: number;
  sheet: string;
  status: EntryAlignmentStatus;
}

// PR-199c: PILOT-3에서 수작업으로 만들었던 PDF·쪽별 표를 summary에 자동으로 넣는다.
// EXTRA는 EXTRA_OTHER+EXTRA_DUPLICATE를 합친 값(요약 표 칸을 과도하게 늘리지 않기 위함).
export interface PageRow {
  pdf: string;
  page: number;
  sheet: string;
  goldenRowCount: number;
  // 같은 (pdf,page,sheet)가 여러 번(run) 호출됐으면 그 실행들의 AI 행 수를 모두 더한다
  // (counts 칸들도 모든 실행을 합산하므로 같은 기준).
  aiRowCount: number;
  counts: Record<PageRowColumn, number>;
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
  // PR-199c 추가 —
  gtStyleNoteCount: number;
  gtStyleNoteList: string[];
  valuePairedCount: number;
  valuePairedExamples: { golden: string; ai: string }[];
  implicitItemNames: string[];
  pageRows: PageRow[];
  pageRowTotalWarnings: string[];
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

function emptyPageRowCounts(): Record<PageRowColumn, number> {
  return PAGE_ROW_COLUMNS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<PageRowColumn, number>);
}

const toPageRowColumn = (type: FieldErrorType): PageRowColumn | null => {
  if (type === 'EXTRA_OTHER' || type === 'EXTRA_DUPLICATE') return 'EXTRA';
  return (PAGE_ROW_COLUMNS as readonly string[]).includes(type) ? (type as PageRowColumn) : null;
};

// PR-199c: pageRows 합계가 전체 bomCounts와 일치하는지 코드로 검증한다(불일치 시
// summary에 경고를 남긴다 — 집계 로직이 두 곳(전체 합계·페이지별 표)에서 갈라지면
// 조용히 어긋날 수 있어서다).
export function validatePageRowTotals(pageRows: PageRow[], bomCounts: Record<string, number>): string[] {
  const totals = emptyPageRowCounts();
  for (const row of pageRows) {
    for (const col of PAGE_ROW_COLUMNS) totals[col] += row.counts[col];
  }
  const expected: Record<PageRowColumn, number> = {
    OK: bomCounts.OK ?? 0,
    VALUE_DIFF: bomCounts.VALUE_DIFF ?? 0,
    VALUE_MISSING: bomCounts.VALUE_MISSING ?? 0,
    NAME_DIFF: bomCounts.NAME_DIFF ?? 0,
    NAME_ABBREV: bomCounts.NAME_ABBREV ?? 0,
    NAME_DIFF_PAIRED_BY_VALUE: bomCounts.NAME_DIFF_PAIRED_BY_VALUE ?? 0,
    EXTRA: (bomCounts.EXTRA_OTHER ?? 0) + (bomCounts.EXTRA_DUPLICATE ?? 0),
    MISSING: bomCounts.MISSING ?? 0,
    MISSING_IMPLICIT: bomCounts.MISSING_IMPLICIT ?? 0,
  };
  const warnings: string[] = [];
  for (const col of PAGE_ROW_COLUMNS) {
    if (totals[col] !== expected[col]) {
      warnings.push(`페이지별 표 합계(${col}=${totals[col]})가 전체 합계(${expected[col]})와 다릅니다.`);
    }
  }
  return warnings;
}

export function buildSummaryData(entries: ScoredEntry[], golden: GoldenStyle[], implicitItemNames: string[] = []): SummaryData {
  const callCountMap = new Map<string, number>();
  const bomCounts = emptyRecord(BOM_COUNT_KEYS);
  const styleNoCounts = emptyRecord(STYLE_COUNT_KEYS);
  const confusionPairs: DigitConfusionPair[] = [];
  const alignmentIssues: AlignmentIssue[] = [];
  const sheetNotFoundKeys = new Set<string>();
  const sheetNotFound: { pdf: string; page: number; sheet: string }[] = [];
  let faceSplitCount = 0;
  let gtStyleNoteCount = 0;
  const gtStyleNoteList: string[] = [];
  let valuePairedCount = 0;
  const valuePairedExamples: { golden: string; ai: string }[] = [];
  const implicitFoundNames = new Set<string>();
  const pageRowMap = new Map<string, PageRow>();

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
      if (styleScore.gtNote) {
        gtStyleNoteCount++;
        gtStyleNoteList.push(`${e.sheet}: "${g.styleNo}"`);
      }
    }

    const rawResults = classifyBomItems(g.bomItems, e.ai.bomItems ?? []);
    const { results: afterFaceSplit, faceSplitCount: fsCount } = mergeFaceColorSplits(rawResults);
    faceSplitCount += fsCount;
    const { results: afterImplicit, implicitItemNames: foundNames } = markImplicitMissing(afterFaceSplit, implicitItemNames);
    for (const n of foundNames) implicitFoundNames.add(n);
    const { results: afterPairing, pairedCount } = pairMissingWithExtraByValue(afterImplicit);
    valuePairedCount += pairedCount;

    const pageKey = `${e.pdf}\u0000${e.page}\u0000${e.sheet}`;
    let pageRow = pageRowMap.get(pageKey);
    if (!pageRow) {
      pageRow = {
        pdf: e.pdf, page: e.page, sheet: e.sheet,
        goldenRowCount: g.bomItems.filter((b) => !b.isLabelZone).length,
        aiRowCount: 0,
        counts: emptyPageRowCounts(),
      };
      pageRowMap.set(pageKey, pageRow);
    }
    pageRow.aiRowCount += (e.ai.bomItems ?? []).length;

    for (const br of afterPairing) {
      if (br.type in bomCounts) bomCounts[br.type]++;
      const col = toPageRowColumn(br.type);
      if (col) pageRow.counts[col]++;
      if (br.type === 'NAME_DIFF_PAIRED_BY_VALUE' && valuePairedExamples.length < 6 && br.golden && br.ai) {
        valuePairedExamples.push({ golden: br.golden.itemName, ai: br.ai.itemName });
      }
    }
  }

  const unstableFields = identifyUnstableFields(buildInstabilityInputs(entries));
  const pageRows = [...pageRowMap.values()];

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
    gtStyleNoteCount,
    gtStyleNoteList,
    valuePairedCount,
    valuePairedExamples,
    implicitItemNames: [...implicitFoundNames],
    pageRows,
    pageRowTotalWarnings: validatePageRowTotals(pageRows, bomCounts),
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

  if (data.gtStyleNoteCount > 0) {
    lines.push('\n## 정답 셀 메모(GT_STYLE_NOTE — 본체만 비교에 썼음)');
    lines.push(`- 건수: ${data.gtStyleNoteCount}`);
    for (const s of data.gtStyleNoteList) lines.push(`- ${s}`);
  }

  if (data.valuePairedCount > 0) {
    lines.push('\n## 값 기반 보조 짝짓기(NAME_DIFF_PAIRED_BY_VALUE — OK/NAME_ABBREV에 미포함, 사람 확인용)');
    lines.push(`- 건수: ${data.valuePairedCount}`);
    for (const p of data.valuePairedExamples) lines.push(`- 정답 "${p.golden}" ↔ AI "${p.ai}"`);
  }

  if (data.implicitItemNames.length > 0) {
    lines.push('\n## 암묵 자재(MISSING_IMPLICIT — 작지에 안 적혀 있어 AI가 읽을 수 없음, 인식 실패 집계 제외)');
    lines.push(`- 건수: ${data.bomCounts.MISSING_IMPLICIT ?? 0}`);
    for (const n of data.implicitItemNames) lines.push(`- ${n}`);
  }

  if (data.pageRows.length > 0) {
    lines.push('\n## PDF·쪽별 자재명세 표');
    lines.push('| PDF | 쪽 | 정답행수 | AI행수 | OK | VALUE_DIFF | VALUE_MISSING | NAME_DIFF | NAME_ABBREV | NAME_DIFF_PAIRED_BY_VALUE | EXTRA | MISSING | MISSING_IMPLICIT |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of data.pageRows) {
      lines.push(
        `| ${r.pdf} | ${r.page} | ${r.goldenRowCount} | ${r.aiRowCount} | ${r.counts.OK} | ${r.counts.VALUE_DIFF} | ${r.counts.VALUE_MISSING} | ${r.counts.NAME_DIFF} | ${r.counts.NAME_ABBREV} | ${r.counts.NAME_DIFF_PAIRED_BY_VALUE} | ${r.counts.EXTRA} | ${r.counts.MISSING} | ${r.counts.MISSING_IMPLICIT} |`,
      );
    }
    if (data.pageRowTotalWarnings.length > 0) {
      lines.push('\n> ⚠ 합계 불일치 경고:');
      for (const w of data.pageRowTotalWarnings) lines.push(`> - ${w}`);
    }
  }

  return lines.join('\n');
}
