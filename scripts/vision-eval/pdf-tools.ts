import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// PR-199: 입력 방식(B/C/D/E)을 만드는 poppler 래퍼. poppler(pdfseparate/pdftoppm/
// pdftocairo/pdfinfo)가 없으면 그 모드만 "건너뜀"으로 보고하고 계속한다(새 런타임
// 의존성 추가 금지 — sharp 등을 쓰지 않고 poppler의 크롭 옵션만 쓴다).

export interface ToolAvailability {
  available: boolean;
  reason?: string;
}

function checkTool(bin: string): ToolAvailability {
  try {
    execFileSync(bin, ['-h'], { stdio: 'ignore' });
    return { available: true };
  } catch (err) {
    return { available: false, reason: `${bin}을 찾을 수 없습니다(poppler-utils 설치 필요) — 이 모드는 건너뜁니다.` };
  }
}

export const checkPdfseparate = (): ToolAvailability => checkTool('pdfseparate');
export const checkPdftoppm = (): ToolAvailability => checkTool('pdftoppm');
export const checkPdftocairo = (): ToolAvailability => checkTool('pdftocairo');
export const checkPdfinfo = (): ToolAvailability => checkTool('pdfinfo');

// 모드 B: 페이지 1장씩 분리된 PDF.
export function separatePdfPages(pdfPath: string, page: number, outDir: string): string {
  const outPath = path.join(outDir, `page-${page}.pdf`);
  execFileSync('pdfseparate', ['-f', String(page), '-l', String(page), pdfPath, outPath]);
  return outPath;
}

// 모드 C: 페이지 1장을 300dpi 그레이 PNG로 렌더.
export function renderPageToGrayPng(pdfPath: string, page: number, outDir: string, dpi = 300): string {
  const prefix = path.join(outDir, `page-${page}`);
  execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-r', String(dpi), '-gray', '-png', pdfPath, prefix]);
  // pdftoppm은 페이지 번호를 0-padding해서 붙인다(예: page-1-01.png) — 디렉터리에서 찾는다.
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith(`page-${page}-`) && f.endsWith('.png'));
  if (files.length === 0) throw new Error(`pdftoppm 출력 파일을 찾지 못했습니다: ${prefix}`);
  return path.join(outDir, files[0]);
}

export interface PageSizePt {
  widthPt: number;
  heightPt: number;
}

// pdfinfo로 페이지 크기(pt)를 읽는다 — 영역 크롭(모드 E)의 픽셀 좌표 계산에 필요.
export function getPageSizePt(pdfPath: string): PageSizePt {
  const out = execFileSync('pdfinfo', [pdfPath]).toString('utf8');
  const match = out.match(/Page size:\s+([\d.]+)\s*x\s*([\d.]+)\s*pts/);
  if (!match) throw new Error('pdfinfo 출력에서 페이지 크기를 찾지 못했습니다.');
  return { widthPt: Number(match[1]), heightPt: Number(match[2]) };
}

export interface CropRegionPercent {
  // 페이지 폭/높이에 대한 비율(0~1) — 3% 여유를 이미 포함한 값을 호출하는 쪽이 넘긴다.
  xFrom: number;
  xTo: number;
  yFrom: number;
  yTo: number;
}

// 모드 E: 영역 크롭 — poppler의 pdftocairo -x/-y/-W/-H(픽셀 단위) 크롭만 쓴다(sharp 등
// 새 의존성 없음). 좌표는 페이지 비율 → 지정한 dpi 기준 픽셀로 변환한다.
export function cropPageRegionToGrayPng(
  pdfPath: string,
  page: number,
  region: CropRegionPercent,
  outPath: string,
  dpi = 300,
): void {
  const { widthPt, heightPt } = getPageSizePt(pdfPath);
  const pxPerPt = dpi / 72;
  const fullWidthPx = widthPt * pxPerPt;
  const fullHeightPx = heightPt * pxPerPt;
  const x = Math.round(region.xFrom * fullWidthPx);
  const y = Math.round(region.yFrom * fullHeightPx);
  const w = Math.round((region.xTo - region.xFrom) * fullWidthPx);
  const h = Math.round((region.yTo - region.yFrom) * fullHeightPx);

  execFileSync('pdftocairo', [
    '-png', '-gray', '-r', String(dpi),
    '-f', String(page), '-l', String(page),
    '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h),
    pdfPath, outPath.replace(/\.png$/, ''),
  ]);
}

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// PR-198 설계에서 쓴 것과 같은 영역(페이지 비율, 3% 여유 포함) — E 모드 전용.
export const CROP_REGIONS: Record<'MATERIAL_TABLE' | 'TRIM_TABLE' | 'SIZE_SPEC_TABLE', CropRegionPercent> = {
  MATERIAL_TABLE: { xFrom: 0, xTo: 1, yFrom: 0.12, yTo: 0.24 },
  TRIM_TABLE: { xFrom: 0.66, xTo: 0.96, yFrom: 0.6, yTo: 0.85 },
  SIZE_SPEC_TABLE: { xFrom: 0.66, xTo: 0.96, yFrom: 0.31, yTo: 0.6 },
};
