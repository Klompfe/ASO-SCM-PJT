#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { maskPath, maskSecret } from './key-mask.util';
import { estimateCost, shouldCallApi, computeCallCountByMode, countDistinctPdfs } from './call-count.util';
import { parseManifestCsv, proposalsToManifestCsv, proposeManifestEntries } from './manifest.util';
import { extractGoldenFromWorkbook, findGoldenBySheetName } from './golden-extract.util';
import { createStandaloneVisionService, runAnalysis } from './model-runner';
import { checkPdfseparate, checkPdftoppm, checkPdftocairo, separatePdfPages, renderPageToGrayPng, cropPageRegionToGrayPng, makeTempDir, CROP_REGIONS } from './pdf-tools';
import { alignResultsToPages } from './alignment';
import { buildSummaryData, renderSummaryMarkdown, type ScoredEntry } from './scoring-pipeline';
import type { EvalMode, GoldenStyle, ManifestEntry, AiResultLike } from './types';

// PR-199: 작지 AI 판독 정확도 측정 하네스 — DB 없음·읽기 전용·로컬 실행. 사용법은
// prompt-reports/PR-199-report.md·PR-199b-report.md에 명령 예시로 정리돼 있다.
// PR-199b(PILOT-2에서 확인): 모드 A는 manifest 행(페이지)이 아니라 PDF 1개당 1번만
// 호출하고, 돌아온 배열을 results[page-1]로 그 PDF의 manifest 행들에 짝짓는다
// (예전엔 행마다 PDF 전체를 다시 보내고 항상 results[0]만 썼다 — 치명적 버그).

interface CliArgs {
  pdfDir?: string;
  xlsxPaths: string[];
  manifestPath?: string;
  proposeManifest: boolean;
  rescoreDir?: string;
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
      case '--rescore': args.rescoreDir = next(); break;
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
  const callCount = pdfFiles.length; // PDF당 1회(제안 전용, 모드/실행 반복 없음)
  console.log(`[vision-eval] 제안 단계 예상 호출 수: ${callCount}건 (manifest 제안은 PDF당 1회)`);
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

// 스타일번호 맵(편집거리 대체 매칭용)과 "정답 시트가 있는지"를 함께 돌려준다.
function buildStyleNoMap(entries: ManifestEntry[], golden: GoldenStyle[]): { styleNoBySheet: Map<string, string | null>; sheetFound: ManifestEntry[]; sheetNotFound: ManifestEntry[] } {
  const styleNoBySheet = new Map<string, string | null>();
  const sheetFound: ManifestEntry[] = [];
  const sheetNotFound: ManifestEntry[] = [];
  for (const e of entries) {
    const g = findGoldenBySheetName(golden, e.sheet);
    if (!g) { sheetNotFound.push(e); continue; }
    styleNoBySheet.set(e.sheet, g.styleNo);
    sheetFound.push(e);
  }
  return { styleNoBySheet, sheetFound, sheetNotFound };
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
  // PR-199b: 모드 A는 PDF 수 기준, 나머지는 페이지(manifest 행) 수 기준으로 따로 계산한다.
  const distinctPdfCount = countDistinctPdfs(manifest.map((e) => e.pdf));
  const callCount = computeCallCountByMode(
    availableModes.map((mode) => ({ mode, unitCount: mode === 'A' ? distinctPdfCount : manifest.length })),
    args.runs,
    models.length,
  );
  const modeBreakdown = availableModes.map((m) => `${m}=${m === 'A' ? distinctPdfCount + 'PDF' : manifest.length + '페이지'}`).join(', ');
  console.log(`[vision-eval] 예상 호출 수: ${callCount}건 (${modeBreakdown} × 실행 ${args.runs} × 모델 ${models.length})`);
  console.log(`[vision-eval] GEMINI_API_KEY=${maskSecret(apiKey)}`);

  if (!shouldCallApi(args.yes)) {
    console.log('[vision-eval] --yes가 없어 호출하지 않고 종료합니다.');
    return;
  }

  const detailsPath = path.join(outDir, 'details.jsonl');
  const detailsStream = fs.createWriteStream(detailsPath, { flags: 'a' });
  const scoredEntries: ScoredEntry[] = [];
  const tempDir = makeTempDir('vision-eval-');
  const { styleNoBySheet, sheetFound, sheetNotFound } = buildStyleNoMap(manifest, golden);

  for (const model of models) {
    const service = createStandaloneVisionService(apiKey, model === '(기본 모델)' ? undefined : model);

    for (const mode of availableModes) {
      if (mode === 'A') {
        // PR-199b 수정: PDF 1개당 1번만 호출(페이지 수만큼 중복 호출하지 않음).
        const pdfNames = [...new Set(sheetFound.map((e) => e.pdf))];
        for (const pdf of pdfNames) {
          const entriesForPdf = sheetFound.filter((e) => e.pdf === pdf);
          const pdfPath = path.join(args.pdfDir, pdf);
          for (let run = 1; run <= args.runs; run++) {
            const { outcome, error } = await runAnalysis(service, {
              buffer: fs.readFileSync(pdfPath), originalname: pdf, mimetype: 'application/pdf',
            });
            detailsStream.write(JSON.stringify({ mode, model, pdf, page: null, run, outcome, error }) + '\n');
            const aligned = alignResultsToPages(entriesForPdf, outcome?.results ?? [], styleNoBySheet);
            for (const a of aligned) {
              scoredEntries.push({ mode, model, pdf, page: a.page, sheet: a.sheet, run, status: a.status, ai: a.ai });
            }
          }
        }
        for (const e of sheetNotFound.filter((x) => x.pdf && pdfNames.includes(x.pdf))) {
          for (let run = 1; run <= args.runs; run++) {
            scoredEntries.push({ mode, model, pdf: e.pdf, page: e.page, sheet: e.sheet, run, status: 'SHEET_NOT_FOUND', ai: null });
          }
        }
        continue;
      }

      // 모드 B/C/E — 이미 페이지 단위로 올바르게 호출한다(1 manifest 행 = 1 호출).
      for (const entry of manifest) {
        const g = findGoldenBySheetName(golden, entry.sheet);
        const pdfPath = path.join(args.pdfDir, entry.pdf);
        for (let run = 1; run <= args.runs; run++) {
          if (!g) {
            scoredEntries.push({ mode, model, pdf: entry.pdf, page: entry.page, sheet: entry.sheet, run, status: 'SHEET_NOT_FOUND', ai: null });
            continue;
          }
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
          scoredEntries.push({ mode, model, pdf: entry.pdf, page: entry.page, sheet: entry.sheet, run, status: 'OK', ai: combined });
        }
      }
    }
  }
  detailsStream.end();

  const summaryData = buildSummaryData(scoredEntries, golden);
  fs.writeFileSync(path.join(outDir, 'summary.md'), renderSummaryMarkdown(summaryData), 'utf8');
  console.log(`[vision-eval] 완료 — ${maskPath(outDir)}/summary.md, details.jsonl 작성됨.`);
}

// PR-199b: --rescore — 기존 vision-eval-out/<시각>/details.jsonl의 저장된 응답을 다시
// 채점한다(API 호출 0). 예전 형식(같은 PDF가 페이지 수만큼 중복 호출된 파일럿)도
// 읽을 수 있어야 하므로, 같은 (mode,model,pdf)의 반복된 줄은 "서로 다른 실행 회차"로
// 취급해 각 회차의 배열을 results[page-1]로 다시 짝짓는다.
async function rescoreMode(args: CliArgs, outDir: string) {
  if (!args.rescoreDir) throw new Error('--rescore에는 결과 폴더 경로가 필요합니다.');
  if (!args.manifestPath) throw new Error('--rescore에도 --manifest가 필요합니다(저장된 응답을 어떤 정답과 비교할지 알아야 함).');

  const detailsPath = path.join(args.rescoreDir, 'details.jsonl');
  if (!fs.existsSync(detailsPath)) {
    console.log(`[vision-eval] ${maskPath(detailsPath)}이 없습니다 — 재채점할 저장된 응답이 없어 종료합니다.`);
    return;
  }

  const manifest = parseManifestCsv(fs.readFileSync(args.manifestPath, 'utf8'));
  const golden = loadGoldenStyles(args.xlsxPaths);
  const { styleNoBySheet, sheetFound, sheetNotFound } = buildStyleNoMap(manifest, golden);

  const records = fs.readFileSync(detailsPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const callsByKey = new Map<string, AiResultLike[][]>();
  let noArrayCount = 0;
  for (const rec of records) {
    if (!rec.outcome?.results) { noArrayCount++; continue; }
    const key = `${rec.mode}\u0000${rec.model}\u0000${rec.pdf}`;
    const list = callsByKey.get(key) ?? [];
    list.push(rec.outcome.results);
    callsByKey.set(key, list);
  }
  if (noArrayCount > 0) {
    console.log(`[vision-eval] ${noArrayCount}건은 저장된 응답에 결과 배열(outcome.results)이 없어 재채점에서 제외합니다(에러 응답이었을 가능성 — details.jsonl의 error 필드 참고).`);
  }
  if (callsByKey.size === 0) {
    console.log(`[vision-eval] ${maskPath(detailsPath)}에 유효한 저장된 응답이 없어 재채점할 수 없습니다.`);
    return;
  }

  const scoredEntries: ScoredEntry[] = [];
  for (const [key, trials] of callsByKey) {
    const [mode, model, pdf] = key.split('\u0000');
    const entriesForPdf = sheetFound.filter((e) => e.pdf === pdf);
    const notFoundForPdf = sheetNotFound.filter((e) => e.pdf === pdf);

    trials.forEach((results, idx) => {
      const run = idx + 1;
      const aligned = alignResultsToPages(entriesForPdf, results, styleNoBySheet);
      for (const a of aligned) scoredEntries.push({ mode, model, pdf, page: a.page, sheet: a.sheet, run, status: a.status, ai: a.ai });
      for (const e of notFoundForPdf) scoredEntries.push({ mode, model, pdf, page: e.page, sheet: e.sheet, run, status: 'SHEET_NOT_FOUND', ai: null });
    });
  }

  const summaryData = buildSummaryData(scoredEntries, golden);
  fs.writeFileSync(path.join(outDir, 'summary.md'), renderSummaryMarkdown(summaryData), 'utf8');
  fs.copyFileSync(detailsPath, path.join(outDir, 'details.jsonl'));
  console.log(`[vision-eval] 재채점 완료(API 호출 0건) — ${maskPath(outDir)}/summary.md 작성됨. 원본 결과: ${maskPath(args.rescoreDir)}`);
}

// 모드별로 실제 API에 보낼 입력(파일) 목록을 만든다. E는 영역 2곳을 각각 호출(소재표,
// 부자재표) — SIZE 실측표 영역은 지시서상 "읽지 않음"이라 만들지 않는다.
async function buildInputsForMode(
  mode: EvalMode,
  pdfPath: string,
  page: number,
  tempDir: string,
): Promise<{ buffer: Buffer; originalname: string; mimetype: string }[]> {
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
  if (args.rescoreDir) {
    await rescoreMode(args, outDir);
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
