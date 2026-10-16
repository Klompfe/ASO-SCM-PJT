#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { maskPath, maskSecret } from './key-mask.util';
import { computeCallCount, estimateCost, shouldCallApi } from './call-count.util';
import { parseManifestCsv, proposalsToManifestCsv, proposeManifestEntries } from './manifest.util';
import { extractGoldenFromWorkbook, findGoldenBySheetName } from './golden-extract.util';
import { createStandaloneVisionService, runAnalysis } from './model-runner';
import { checkPdfseparate, checkPdftoppm, checkPdftocairo, separatePdfPages, renderPageToGrayPng, cropPageRegionToGrayPng, makeTempDir, CROP_REGIONS } from './pdf-tools';
import { classifyBomItems, checkLabelZonePresence } from './scoring/bom-match';
import { scoreStyleNo, aggregateConfusionPairs } from './scoring/style-field';
import { scoreDateField } from './scoring/date-field';
import { identifyUnstableFields } from './scoring/instability';
import type { EvalMode, GoldenStyle, ManifestEntry, AiResultLike } from './types';

// PR-199: 작지 AI 판독 정확도 측정 하네스 — DB 없음·읽기 전용·로컬 실행. 사용법은
// prompt-reports/PR-199-report.md에 명령 예시로 정리돼 있다.

interface CliArgs {
  pdfDir?: string;
  xlsxPaths: string[];
  manifestPath?: string;
  proposeManifest: boolean;
  modes: EvalMode[];
  runs: number;
  maxPages?: number;
  yes: boolean;
  pilot: boolean;
  models: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { xlsxPaths: [], proposeManifest: false, modes: ['A'], runs: 3, yes: false, pilot: false, models: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--pdf-dir': args.pdfDir = next(); break;
      case '--xlsx': args.xlsxPaths.push(next()); break;
      case '--manifest': args.manifestPath = next(); break;
      case '--propose-manifest': args.proposeManifest = true; break;
      case '--modes': args.modes = next().split(',').map((m) => m.trim().toUpperCase()) as EvalMode[]; break;
      case '--runs': args.runs = Number(next()); break;
      case '--max-pages': args.maxPages = Number(next()); break;
      case '--yes': args.yes = true; break;
      case '--pilot': args.pilot = true; break;
      case '--models': args.models = next().split(',').map((m) => m.trim()); break;
      default: break;
    }
  }
  return args;
}

function loadGoldenStyles(xlsxPaths: string[]): GoldenStyle[] {
  return xlsxPaths.flatMap((p) => {
    const wb = XLSX.readFile(p);
    return extractGoldenFromWorkbook(wb);
  });
}

function checkModeAvailability(modes: EvalMode[]): { available: EvalMode[]; skipped: { mode: EvalMode; reason: string }[] } {
  const available: EvalMode[] = [];
  const skipped: { mode: EvalMode; reason: string }[] = [];
  for (const mode of modes) {
    if (mode === 'A') { available.push(mode); continue; }
    if (mode === 'B') {
      const r = checkPdfseparate();
      r.available ? available.push(mode) : skipped.push({ mode, reason: r.reason! });
      continue;
    }
    if (mode === 'C') {
      const r = checkPdftoppm();
      r.available ? available.push(mode) : skipped.push({ mode, reason: r.reason! });
      continue;
    }
    if (mode === 'D') {
      // 현재 SDK(@google/generative-ai@^0.24)는 mediaResolution 옵션을 지원하지 않는다
      // (PR-199 지시서에 명시된 전제) — 새 SDK 교체는 이 PR 범위가 아니므로 항상 건너뛴다.
      skipped.push({ mode, reason: 'mediaResolution(HIGH)은 현재 SDK(@google/generative-ai@^0.24)가 지원하지 않습니다 — 건너뜁니다(새 SDK 교체는 이 PR 범위 아님).' });
      continue;
    }
    if (mode === 'E') {
      const r = checkPdftocairo();
      r.available ? available.push(mode) : skipped.push({ mode, reason: r.reason! });
      continue;
    }
  }
  return { available, skipped };
}

async function proposeManifestMode(args: CliArgs, outDir: string) {
  if (!args.pdfDir) throw new Error('--propose-manifest에는 --pdf-dir이 필요합니다.');
  const golden = loadGoldenStyles(args.xlsxPaths);
  const sheetNames = golden.map((g) => g.sheetName);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 필요합니다(제안 단계도 스타일번호를 한 번 읽어야 함).');

  const pdfFiles = fs.readdirSync(args.pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
  const callCount = pdfFiles.length; // 페이지당 1회(제안 전용, 모드/실행 반복 없음)
  console.log(`[vision-eval] 제안 단계 예상 호출 수: ${callCount}건 (manifest 제안은 1페이지=1회)`);
  if (!shouldCallApi(args.yes)) {
    console.log('[vision-eval] --yes가 없어 호출하지 않고 종료합니다.');
    return;
  }

  const service = createStandaloneVisionService(apiKey);
  const candidates: { pdf: string; page: number; readStyleNo: string | null }[] = [];
  for (const pdf of pdfFiles) {
    const buffer = fs.readFileSync(path.join(args.pdfDir, pdf));
    const { outcome } = await runAnalysis(service, { buffer, originalname: pdf, mimetype: 'application/pdf' });
    (outcome?.results ?? []).forEach((r, idx) => {
      candidates.push({ pdf, page: idx + 1, readStyleNo: r.overview?.styleNo ?? null });
    });
  }

  const proposals = proposeManifestEntries(candidates, sheetNames);
  const csv = proposalsToManifestCsv(proposals);
  const outPath = path.join(outDir, 'manifest-proposal.csv');
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`[vision-eval] 제안 파일 작성: ${maskPath(outPath)} — 사람이 확인·수정 후 --manifest로 넘겨 주세요.`);
}

interface ScoredRun {
  mode: EvalMode;
  model: string;
  entry: ManifestEntry;
  run: number;
  ai: AiResultLike | null;
}

function buildSummary(scoredRuns: ScoredRun[], golden: GoldenStyle[]): string {
  const lines: string[] = [];
  lines.push('# vision-eval summary\n');

  const byModeModel = new Map<string, ScoredRun[]>();
  for (const r of scoredRuns) {
    const key = `${r.mode}\u0000${r.model}`;
    byModeModel.set(key, [...(byModeModel.get(key) ?? []), r]);
  }

  const counts = { OK: 0, VALUE_DIFF: 0, NAME_DIFF: 0, EXTRA_DUPLICATE: 0, EXTRA_OTHER: 0, MISSING: 0 };
  const styleNoCounts = { EXACT: 0, SUFFIX_MISSING: 0, SUFFIX_DIGIT: 0, OTHER_MISMATCH: 0 };
  const confusionPairs: { golden: string; read: string }[] = [];

  for (const r of scoredRuns) {
    if (!r.ai) continue;
    const g = findGoldenBySheetName(golden, r.entry.sheet);
    if (!g) continue;

    if (g.styleNo) {
      const styleScore = scoreStyleNo(g.styleNo, r.ai.overview?.styleNo ?? null);
      styleNoCounts[styleScore.type]++;
      if (styleScore.confusion) confusionPairs.push(styleScore.confusion);
    }

    const bomResults = classifyBomItems(g.bomItems, r.ai.bomItems ?? []);
    for (const br of bomResults) {
      if (br.type in counts) counts[br.type as keyof typeof counts]++;
    }
  }

  lines.push('## 조용한 오류(틀렸지만 신뢰할 수 있는 값으로 나온 것)');
  lines.push('> 신호 평가는 --pilot 실행 후 signals.ts 결과를 사람이 해석해 이 자리에 채운다.\n');

  lines.push('## 모드별 호출 수');
  for (const [key, runs] of byModeModel) {
    const [mode, model] = key.split('\u0000');
    lines.push(`- 모드 ${mode} / 모델 ${model}: ${runs.length}건`);
  }

  lines.push('\n## 자재명세 오류 유형별 건수');
  for (const [type, count] of Object.entries(counts)) {
    lines.push(`- ${type}: ${count}`);
  }

  lines.push('\n## 스타일번호 오류 유형별 건수');
  for (const [type, count] of Object.entries(styleNoCounts)) {
    lines.push(`- ${type}: ${count}`);
  }

  if (confusionPairs.length > 0) {
    lines.push('\n## 끝 글자 혼동표 (정답 → 읽은 값)');
    for (const pair of aggregateConfusionPairs(confusionPairs)) {
      lines.push(`- ${pair.golden} → ${pair.read}: ${pair.count}건`);
    }
  }

  return lines.join('\n');
}

async function runEvalMode(args: CliArgs, outDir: string) {
  if (!args.manifestPath) throw new Error('--manifest가 필요합니다(--propose-manifest로 먼저 제안 파일을 만들 수 있습니다).');
  if (!args.pdfDir) throw new Error('--pdf-dir이 필요합니다.');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 필요합니다.');

  const manifest = parseManifestCsv(fs.readFileSync(args.manifestPath, 'utf8'));
  const golden = loadGoldenStyles(args.xlsxPaths);
  const { available: availableModes, skipped } = checkModeAvailability(args.modes);
  for (const s of skipped) console.warn(`[vision-eval] 모드 ${s.mode} 건너뜀: ${s.reason}`);

  const models = args.models.length > 0 ? args.models : [process.env.GEMINI_MODEL || '(기본 모델)'];
  const callCount = computeCallCount({ pages: manifest.length, modes: availableModes.length, runs: args.runs, models: models.length });
  console.log(`[vision-eval] 예상 호출 수: ${callCount}건 (페이지 ${manifest.length} × 모드 ${availableModes.length} × 실행 ${args.runs} × 모델 ${models.length})`);
  console.log(`[vision-eval] GEMINI_API_KEY=${maskSecret(apiKey)}`);

  if (!shouldCallApi(args.yes)) {
    console.log('[vision-eval] --yes가 없어 호출하지 않고 종료합니다.');
    return;
  }

  const detailsPath = path.join(outDir, 'details.jsonl');
  const detailsStream = fs.createWriteStream(detailsPath, { flags: 'a' });
  const scoredRuns: ScoredRun[] = [];
  const tempDir = makeTempDir('vision-eval-');

  for (const model of models) {
    const service = createStandaloneVisionService(apiKey, model === '(기본 모델)' ? undefined : model);
    for (const mode of availableModes) {
      for (const entry of manifest) {
        const pdfPath = path.join(args.pdfDir, entry.pdf);
        for (let run = 1; run <= args.runs; run++) {
          const inputs = await buildInputsForMode(mode, pdfPath, entry.page, tempDir);
          let combined: AiResultLike | null = null;
          for (const input of inputs) {
            const { outcome, error } = await runAnalysis(service, input);
            detailsStream.write(JSON.stringify({ mode, model, pdf: entry.pdf, page: entry.page, run, outcome, error }) + '\n');
            if (outcome?.results?.[0]) {
              combined = combined
                ? { overview: combined.overview, bomItems: [...combined.bomItems, ...outcome.results[0].bomItems] }
                : outcome.results[0];
            }
          }
          scoredRuns.push({ mode, model, entry, run, ai: combined });
        }
      }
    }
  }
  detailsStream.end();

  const summary = buildSummary(scoredRuns, golden);
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary, 'utf8');
  console.log(`[vision-eval] 완료 — ${maskPath(outDir)}/summary.md, details.jsonl 작성됨.`);
}

// 모드별로 실제 API에 보낼 입력(파일) 목록을 만든다. E는 영역 2곳을 각각 호출(소재표,
// 부자재표) — SIZE 실측표 영역은 지시서상 "읽지 않음"이라 만들지 않는다.
async function buildInputsForMode(
  mode: EvalMode,
  pdfPath: string,
  page: number,
  tempDir: string,
): Promise<{ buffer: Buffer; originalname: string; mimetype: string }[]> {
  if (mode === 'A') {
    return [{ buffer: fs.readFileSync(pdfPath), originalname: path.basename(pdfPath), mimetype: 'application/pdf' }];
  }
  if (mode === 'B') {
    const separated = separatePdfPages(pdfPath, page, tempDir);
    return [{ buffer: fs.readFileSync(separated), originalname: path.basename(separated), mimetype: 'application/pdf' }];
  }
  if (mode === 'C') {
    const png = renderPageToGrayPng(pdfPath, page, tempDir);
    return [{ buffer: fs.readFileSync(png), originalname: path.basename(png), mimetype: 'image/png' }];
  }
  if (mode === 'E') {
    const materialPng = path.join(tempDir, `material-${page}.png`);
    const trimPng = path.join(tempDir, `trim-${page}.png`);
    cropPageRegionToGrayPng(pdfPath, page, CROP_REGIONS.MATERIAL_TABLE, materialPng);
    cropPageRegionToGrayPng(pdfPath, page, CROP_REGIONS.TRIM_TABLE, trimPng);
    return [
      { buffer: fs.readFileSync(materialPng), originalname: 'material.png', mimetype: 'image/png' },
      { buffer: fs.readFileSync(trimPng), originalname: 'trim.png', mimetype: 'image/png' },
    ];
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(__dirname, '../../vision-eval-out', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(outDir, { recursive: true });

  if (args.proposeManifest) {
    await proposeManifestMode(args, outDir);
    return;
  }
  await runEvalMode(args, outDir);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[vision-eval] 오류: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
