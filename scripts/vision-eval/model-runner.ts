import { ConfigService } from '@nestjs/config';
import { VisionService, type AiAnalysisOutcome } from '../../src/sales-orders/vision.service';
import { maskPath } from './key-mask.util';

// PR-199: VisionService를 Nest 앱/모듈/TypeORM 없이 직접 생성한다 — 운영 DB에 절대
// 붙지 않는다(이 파일이 DataSource/TypeOrmModule/AppModule을 import하지 않는 것으로
// 보장한다 — no-db-import.spec.ts가 모듈 import 그래프로 확인).
export function createStandaloneVisionService(apiKey: string, model?: string): VisionService {
  // 하네스는 GEMINI_FALLBACK_MODEL을 설정하지 않은 채 호출해야 한다(예비모델 전환으로
  // 결과가 섞이면 모드/모델 비교가 무의미해진다) — 실행 환경에 이미 설정돼 있으면
  // 경고하고 이 프로세스 안에서만 지운다(사용자 .env 파일 자체는 건드리지 않음).
  if (process.env.GEMINI_FALLBACK_MODEL) {
    // eslint-disable-next-line no-console
    console.warn('[vision-eval] GEMINI_FALLBACK_MODEL이 설정돼 있어 이번 실행에서만 무시합니다(결과 혼선 방지).');
    delete process.env.GEMINI_FALLBACK_MODEL;
  }
  const internalConfig: Record<string, string> = { GEMINI_API_KEY: apiKey };
  if (model) internalConfig.GEMINI_MODEL = model;
  return new VisionService(new ConfigService(internalConfig));
}

export interface AnalyzeFileOptions {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// VisionService.analyzeSalesOrder(file: Express.Multer.File)에 맞춰 최소 필드만
// 채운 가짜 Multer 파일을 만든다(Express 서버를 띄우지 않으므로 실제 Multer 인스턴스
// 없이 buffer/mimetype만 있으면 된다).
export function toMulterFile(options: AnalyzeFileOptions): Express.Multer.File {
  return {
    buffer: options.buffer,
    originalname: options.originalname,
    mimetype: options.mimetype,
    fieldname: 'file',
    encoding: '7bit',
    size: options.buffer.length,
    stream: undefined as any,
    destination: '',
    filename: options.originalname,
    path: '',
  } as Express.Multer.File;
}

export interface RunAnalysisResult {
  outcome: AiAnalysisOutcome | null;
  error: { message: string; supported: boolean } | null;
}

// 모델이 그 입력(PDF/이미지)을 지원하지 않아 호출이 거절되면(mime_type 오류 등)
// "지원 안 됨"으로 표시하고 계속 진행할 수 있게 에러를 삼켜서 돌려준다.
export async function runAnalysis(service: VisionService, options: AnalyzeFileOptions): Promise<RunAnalysisResult> {
  try {
    const outcome = await service.analyzeSalesOrder(toMulterFile(options));
    return { outcome, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const supported = !/mime.?type|unsupported|invalid.*media/i.test(message);
    // eslint-disable-next-line no-console
    console.warn(`[vision-eval] 분석 실패(${maskPath(options.originalname)}): ${message}`);
    return { outcome: null, error: { message, supported } };
  }
}
