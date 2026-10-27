import {
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GoogleGenerativeAIAbortError, SchemaType } from '@google/generative-ai';
import { AiSalesOrderResultDto } from './dto/ai-analysis.dto';
import { isSuspiciousTargetRdd } from './utils/target-rdd-validation.util';
import { rolloverTargetRddYear } from './utils/target-rdd-year-rollover.util';
import { isMidoBuyer } from './utils/mido-buyer.util';
import {
  checkStyleNo,
  splitSupplierItemName,
  checkUnknownName,
  findDuplicateGroups,
  checkDocumentDateSuspicious,
  checkYocheokMismatch,
  groupBomItemsForYocheok,
  checkYocheokMismatchBundle,
  type VisionWarning,
} from './utils/vision-guardrails.util';

// PR-190 보강: "오늘" 기준 납기 연도 보정/의심 판정은 반드시 한국시간(KST, UTC+9) 날짜여야
// 한다 — new Date().toISOString()은 UTC라 한국 00:00~09:00 사이에는 하루 전 날짜가 되어
// 버린다(예: KST 2026-10-14 03:00 = UTC 2026-10-13 18:00 → slice(0,10)하면 어제로 계산됨).
export function todayKstIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface AiAnalysisUsage {
  pageCount: number;
  promptTokens: number;
  outputTokens: number; // candidatesTokenCount + thoughtsTokenCount
}

// PR-200: 서버 검증 후처리에 쓰는 참고 목록 — DB 조회는 호출자(SalesOrdersService)가
// 하고 VisionService는 평범한 배열만 받는다(VisionService를 DB 비의존으로 유지).
export interface VisionGuardrailContext {
  masterItemNames?: string[];
  supplierNames?: string[];
  knownStyleNos?: string[];
}

export interface AiAnalysisOutcome {
  results: AiSalesOrderResultDto[];
  usage: AiAnalysisUsage;
  // PR-096: GEMINI_API_KEY 미설정으로 목업 데이터를 반환한 경우 true. 기존에는
  // usage.pageCount === 0(과금 로그를 안 남기려는 목적으로 우회 도입된 값)으로
  // 간접 추론했는데, 이 우회 신호에 프론트가 의존하다 보니 화면에 목업 여부가 전혀
  // 드러나지 않는 사고로 이어졌다 — 그래서 명시적인 boolean 하나로 통일한다.
  isMock: boolean;
  // PR-192: 기본 모델이 503/429로 재시도를 전부 소진했을 때 GEMINI_FALLBACK_MODEL로
  // 전환해 1회 더 시도한 경우를 화면에 알리기 위한 필드 — modelUsed는 실제로 결과를
  // 만들어낸 모델명(목업이면 null), fallbackUsed는 폴백 모델로 처리됐는지.
  modelUsed: string | null;
  fallbackUsed: boolean;
}

// PR-199: export만 추가(측정 하네스가 운영 프롬프트/스키마를 그대로 재사용하기 위함) —
// 값/동작은 전혀 바꾸지 않음.
export const RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      overview: {
        type: SchemaType.OBJECT,
        properties: {
          styleNo: { type: SchemaType.STRING, nullable: true },
          styleName: { type: SchemaType.STRING, nullable: true },
          itemType: { type: SchemaType.STRING, nullable: true },
          brand: { type: SchemaType.STRING, nullable: true },
          productionType: { type: SchemaType.STRING, enum: ['FOB', 'CMT'], nullable: true },
          factory: { type: SchemaType.STRING, nullable: true },
          buyer: { type: SchemaType.STRING, nullable: true },
          totalQty: { type: SchemaType.NUMBER, nullable: true },
          targetRdd: { type: SchemaType.STRING, nullable: true, description: '계획DELI 하위 "납기" 라벨의 날짜, YYYY-MM-DD' },
          documentDate: { type: SchemaType.STRING, nullable: true, description: '문서 상단에 적힌 작성일, YYYY-MM-DD (납기와 다른 값)' },
          handwrittenCmtPriceCandidate: { type: SchemaType.NUMBER, nullable: true, description: '미도 바이어 건에서만: 문서 상단에 수기로 비교적 큰 글씨로 적힌 숫자(CMT단가 후보, 계산식이 있으면 최종 합계). 미도가 아니거나 확신이 없으면 null' },
          handwrittenCmtPriceMemo: { type: SchemaType.STRING, nullable: true, description: '미도 바이어 건에서만: 수기 표기를 보이는 그대로 옮긴 문자열(예: "7,270 + 230 = 7,500"). 식이 없으면 숫자만. 미도가 아니거나 확신이 없으면 null' },
        },
        required: ['styleNo', 'styleName', 'itemType', 'brand', 'productionType', 'factory', 'buyer', 'totalQty', 'targetRdd', 'documentDate', 'handwrittenCmtPriceCandidate', 'handwrittenCmtPriceMemo'],
      },
      bomItems: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            category: { type: SchemaType.STRING, nullable: true },
            itemName: { type: SchemaType.STRING },
            spec: { type: SchemaType.STRING, nullable: true },
            colorCode: { type: SchemaType.STRING, nullable: true },
            consumption: { type: SchemaType.NUMBER, nullable: true },
            requiredQty: { type: SchemaType.NUMBER, nullable: true },
            supplier: { type: SchemaType.STRING, nullable: true },
            remarks: { type: SchemaType.STRING, nullable: true },
            materialSubTypeCandidate: {
              type: SchemaType.STRING,
              nullable: true,
              enum: ['코아사', '오바사', '지누이도', '다데', '암홀'],
              description: '실/테이프 종류 후보 — 자재명/규격에 명확한 단서가 있을 때만, 확신 없으면 null',
            },
            // PR-200: 추가만(required에 안 넣음) — 한 줄을 여러 이름 후보로 중복 출력하는
            // 대신 가장 가능성 높은 이름 하나는 itemName에, 나머지 후보는 여기로.
            itemNameCandidates: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: true },
            consumptionCandidates: { type: SchemaType.ARRAY, items: { type: SchemaType.NUMBER }, nullable: true },
            uncertain: { type: SchemaType.BOOLEAN, nullable: true },
            uncertainReason: { type: SchemaType.STRING, nullable: true },
          },
          required: ['itemName'],
        },
      },
      sizeSpecs: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            part: { type: SchemaType.STRING },
            size: { type: SchemaType.STRING },
            instructedValue: { type: SchemaType.STRING, nullable: true },
            sampleValue: { type: SchemaType.STRING, nullable: true },
            diffValue: { type: SchemaType.STRING, nullable: true },
            finalValue: { type: SchemaType.STRING, nullable: true },
          },
          required: ['part', 'size'],
        },
      },
      workNotes: { type: SchemaType.STRING, nullable: true },
    },
    required: ['overview', 'bomItems', 'sizeSpecs', 'workNotes'],
  },
};

export const PROMPT = `이 문서는 의류 제조업체의 "작업지시서"입니다. 여러 페이지가 있을 수 있고, 각 페이지(또는 각 스타일)마다 하나의 결과 항목을 배열로 반환하세요.

각 항목은 아래 3가지로 구분해서 추출합니다:

1. overview(오더개요): Style NO., 스타일명, ITEM(품목 종류), 브랜드(문서 하단 회사명이 아니라 상표/브랜드), 임가공 구분(완사입=FOB, CMT=CMT), 소재(원단) 공장/생산처, 바이어, TOTAL 수량, documentDate(문서 상단에 적힌 작성일), targetRdd(납기).

documentDate와 targetRdd는 문서 안의 서로 다른 위치에 있는 서로 다른 값이며 절대 혼동하지 마세요:
- documentDate: 문서 상단에 적힌 이 작업지시서의 작성일(YYYY-MM-DD로 변환).
- targetRdd: 계획DELI 항목의 하위 라벨 "납기"에 적힌 날짜(YYYY-MM-DD로 변환). documentDate와 targetRdd는 서로 다른 필드로 각각 독립적으로 인식하세요 — "납기"에 적힌 날짜를 못 찾았다고 해서 작성일을 납기 대신 넣지 마세요. 납기는 항상 작성일 이후입니다. 연도가 안 보이면(예: "2/17") documentDate 이후 가장 가까운 해당 월/일로 변환하세요 — documentDate와 같은 연도를 붙였을 때 작성일보다 이전이 되면(예: 작성일 2026-07-01, 납기 "2/17" → 2026-02-17은 작성일 이전이라 틀림) 다음 해로 변환하세요(2026-07-01 기준 "2/17" → 2027-02-17). 월/일이 documentDate보다 늦으면 같은 연도를 쓰세요(2026-07-01 기준 "12/30" → 2026-12-30). 절대 작성일보다 이전 날짜로 만들지 마세요.

handwrittenCmtPriceCandidate / handwrittenCmtPriceMemo: 바이어(buyer)가 "미도"로 명확히 인식된 문서에서만 채우세요. 문서 상단에 인쇄된 표 글자와 구분되는, 손으로 비교적 큰 글씨로 적힌 숫자가 있으면 추출하세요. "기본금액 + 230 = 7,500"처럼 계산식 형태면 candidate에는 식의 마지막 합계 숫자만, memo에는 식 전체를 보이는 그대로(원문 표기) 옮기세요(식이 없으면 memo에도 숫자만). 바이어가 미도가 아니거나, 바이어를 못 읽었거나, 그런 수기 숫자가 없거나, 여러 후보가 있어 어느 것인지 확신할 수 없으면 둘 다 반드시 null로 두고 절대 추측하지 마세요.

2. bomItems(자재명세): 상단 소재 표(소재No./소재명/색상/규격/요척/출고량)와 하단 부자재 표(안감/심지/포켓감/테이프/재봉사/단추/라벨 등, 규격/소요량/비고)를 모두 각 행 하나씩 bomItems 배열 항목으로 변환하세요. category는 소재/안감/심지/부자재 등 표의 구분명, itemName은 소재명 또는 부자재명, spec은 규격/색상, consumption은 요척 또는 소요량(숫자만, 단위 제외). supplier(공급처)는 문서에 실제로 인쇄/기재된 값이 있을 때만 그대로 옮기고, 문서에 없으면 절대 추정하지 말고 반드시 null로 두세요 — 공급처는 작업지시서 시점에는 정해지지 않고 이후 발주 단계에서 결정되는 정보입니다.

materialSubTypeCandidate: 실(THREAD)이나 테이프류 자재 행에서만, 자재명 또는 규격란 텍스트에 "코아사"/"오바사"/"스쿠이사"/"지누이도"/"다데"/"암홀" 같은 글자가 그대로(또는 거의 그대로) 포함되어 있어 종류를 명확히 특정할 수 있을 때만 채우세요(스쿠이사는 오바사로, 다른 이름들은 가장 가까운 항목으로 매핑). 실/테이프가 아닌 자재이거나, 그런 단서가 없거나, 여러 후보 중 어느 것인지 확신할 수 없으면 반드시 null로 두고 절대 추측하지 마세요.

3. sizeSpecs(작업명세 - 사이즈 스펙표): "SIZE" 표(부위별 지시서/견본/증감/완성 값 x 사이즈 0/1/2/Free 등 컬럼)를 부위 x 사이즈 조합마다 한 행씩 변환하세요. 값이 손글씨 분수(예: 32½)면 그대로 문자열로 옮기세요. 빈 칸은 null로 두세요.

4. workNotes(작업명세 - 지시사항): 옷 스케치 주변에 손글씨로 적힌 봉제 방식, 라벨 위치, 후가공 지시, 특이사항 등을 사람이 읽을 수 있는 자유 텍스트로 요약하세요. 구조화하지 말고 문단/목록 형태의 텍스트로 반환하세요.

읽을 수 없거나 문서에 없는 값은 null로 두고, 절대 지어내지 마세요.

판독 규칙(실제 오독 사례로 확인된 패턴, PR-200):
- 스타일번호(styleNo) 형식은 "MB|MBS|LB|VB" + 영숫자 2자 + 영문 3자(품목코드) + 숫자 3자리 + 끝 영문 1자입니다(예: MB00AAA000Z). 끝 글자를 빠뜨리지 마세요. 끝 글자는 절대 숫자가 아닙니다 — Z(약 80%)·A·R·K(합쳐 약 10%)·D(약 5%)·P(약 3%)·C·F(각 약 1%) 중 하나입니다. 손글씨 Z는 2·3·7처럼, A는 4처럼 보일 수 있으니 숫자처럼 보여도 영문자로 읽어 위 글자 중 가장 가까운 것을 쓰세요(확신이 안 서면 overview가 아니라 해당 bomItem에 uncertain=true와 uncertainReason을 채우세요). 스타일번호는 영문 대문자와 숫자로만 이루어지고 하이픈·공백·소문자가 들어가지 않습니다. 영문자가 와야 할 자리(접두·품목코드 3자·끝 글자)에서 숫자 0처럼 보이는 글자는 영문 O일 수 있습니다(예: 품목코드 "OPM"을 "0PM"으로 읽지 마세요).
- 헤더의 "소재/소재명"은 겉감을 뜻합니다. 공급사의 소재코드·소재명을 따로 항목으로 만들지 말고 그 행의 구분은 "겉감"으로 하세요. 규격·요척·색상·사이즈별 수량 같은 핵심 값은 정확히 읽으세요.
- "공급사)자재명" 형식: ")" 앞은 공급사명, 뒤는 자재명입니다(예: "르카이)KL-R114" → 공급사 르카이, 자재명 KL-R114). ")"를 지우거나 두 이름을 붙여 쓰지 마세요.
- 한 줄 = 한 항목입니다. 같은 줄을 다른 이름 후보로 여러 행 출력하지 마세요. 읽기 어려운 이름은 가장 가능성 높은 이름 하나를 itemName에, 나머지 후보는 itemNameCandidates에 넣으세요.
- 빈 칸은 null입니다. 위·아래 줄의 값을 복사하지 마세요(소재표에서 색상 줄이 비어 있어도 다른 색상의 요척을 쓰지 마세요).
- 새 항목은 표에서만 만드세요. 스케치·손글씨 메모의 글자로 새 자재 행을 만들지 마세요(메모는 workNotes로).
- 숫자: 손글씨 요척·소요량에서 7↔9, 2↔3, 3↔9, 1↔7, 4↔9가 특히 헷갈리니 칸 안에서 다시 확인하고, 확신이 없으면 uncertain=true와 consumptionCandidates에 가능한 값을 모두 적으세요.
- 날짜: 작성일은 "YY년 M월 D일"의 월·일 숫자를 그대로 옮기세요(7월을 1월로 바꾸지 마세요).`;

const DEFAULT_MODEL = 'gemini-3.6-flash';
// PR-192 실측(Render 로그, 2026-10-13): gemini-3.6-flash가 503 과부하 상태일 때 2번째
// 재시도만으로도 응답까지 약 49초가 걸렸고, 20분 뒤 재시도도 똑같이 503으로 실패했다 —
// 일시 스파이크가 아니라 길게 이어지는 용량 부족이라 재시도 간격을 늘리고 전체 시간을
// 240초로 제한한 뒤, 그래도 안 되면 폴백 모델로 넘긴다(환경변수 미설정 시 폴백 없음).
const TOTAL_BUDGET_MS = 240_000;
const RETRY_DELAYS_MS = [5000, 15000, 30000];
// PR-192 보완: GEMINI_FALLBACK_MODEL이 설정된 경우 기본 모델 단계는 전체 예산의 40%
// (약 96초)까지만 쓰고 폴백으로 넘어간다 — 503이 약 50초 만에 돌아오는 실측 기준으로,
// 기본 모델에서 재시도를 다 쓰면 이미 150~200초가 지나 있어 폴백이 시작해도 프런트의
// 270초 제한을 넘겨버리는 문제(검토에서 발견)를 막기 위함이다.
const PRIMARY_STAGE_BUDGET_MS = 96_000;
// 이 시간 미만으로 예산이 남으면 새 시도를 시작하지 않고 바로 재시도 소진으로 처리한다
// (시도 도중 타임아웃이 나버리면 재시도/폴백 판단 자체가 불가능해지므로).
const MIN_ATTEMPT_TIMEOUT_MS = 10_000;

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly genAI: GoogleGenerativeAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!this.genAI) {
      this.logger.warn('GEMINI_API_KEY가 설정되지 않아 작업지시서 AI 분석은 목업 데이터를 반환합니다.');
    }
  }

  async analyzeSalesOrder(file: Express.Multer.File, context: VisionGuardrailContext = {}): Promise<AiAnalysisOutcome> {
    if (!this.genAI) {
      // 목업 응답은 실제 API 비용이 없으므로 pageCount=0으로 반환해 과금 로그를 남기지 않는다.
      return {
        results: this.mockResult(),
        usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 },
        isMock: true,
        modelUsed: null,
        fallbackUsed: false,
      };
    }

    const fileSizeKb = file.buffer ? Math.round(file.buffer.length / 1024) : 0;
    this.logger.log(`작업지시서 분석 시작 — file=${file.originalname ?? '(unknown)'}, mimetype=${file.mimetype}, size=${fileSizeKb}KB`);

    const startedAt = Date.now();
    const primaryModel = this.configService.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;
    const fallbackModel = this.configService.get<string>('GEMINI_FALLBACK_MODEL') || null;
    const parts = [
      { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } },
      { text: PROMPT },
    ];

    let modelUsed = primaryModel;
    let fallbackUsed = false;
    let result: Awaited<ReturnType<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']>>;

    // 폴백 모델이 설정돼 있으면 기본 모델 단계는 전체 예산의 40%(96초)까지만 쓰고,
    // 폴백이 없으면 기존처럼 전체 240초를 기본 모델에 그대로 쓴다.
    const primaryDeadlineAt = fallbackModel ? startedAt + PRIMARY_STAGE_BUDGET_MS : startedAt + TOTAL_BUDGET_MS;

    try {
      try {
        result = await this.generateWithRetry(this.buildModel(primaryModel), parts, startedAt, primaryDeadlineAt, primaryModel);
      } catch (err) {
        if (!fallbackModel || !(err as any).retriesExhausted) {
          throw err;
        }
        const elapsedMs = Date.now() - startedAt;
        this.logger.warn(`기본 모델 단계 마감(${PRIMARY_STAGE_BUDGET_MS / 1000}초) — 폴백으로 전환 (경과 ${elapsedMs}ms)`);
        // 폴백 단계는 전체 240초 예산 중 남은 시간을 그대로 쓴다(기본 모델 단계에서 쓴 시간 제외).
        result = await this.generateWithRetry(this.buildModel(fallbackModel), parts, startedAt, startedAt + TOTAL_BUDGET_MS, fallbackModel);
        modelUsed = fallbackModel;
        fallbackUsed = true;
        this.logger.log(`폴백 모델로 처리: ${fallbackModel}`);
      }
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      if (this.isTimeoutError(err)) {
        this.logger.error(`작업지시서 AI 분석 타임아웃(경과 ${elapsedMs}ms): ${(err as Error).message}`);
        throw new GatewayTimeoutException(
          'AI 분석이 너무 오래 걸려 중단했습니다. 페이지 수를 줄여(예: 5페이지 이하로 나눠) 다시 올려 주세요.',
        );
      }
      if ((err as any).retriesExhausted) {
        this.logger.error(`작업지시서 AI 분석 실패 — 재시도 소진(경과 ${elapsedMs}ms): ${(err as Error).message}`);
        throw new ServiceUnavailableException(
          'AI 서버가 일시적으로 혼잡합니다. 1~2분 뒤 다시 시도해 주세요. (파일 문제가 아닙니다)',
        );
      }
      this.logger.error(`작업지시서 AI 분석 실패(경과 ${elapsedMs}ms): ${(err as Error).message}`);
      throw new InternalServerErrorException('작업지시서 AI 분석에 실패했습니다.');
    }

    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      this.logger.warn(`Gemini 응답이 정상 종료되지 않음(finishReason=${finishReason}) - 응답이 잘렸을 수 있습니다.`);
    }

    let parsed: AiSalesOrderResultDto[];
    try {
      const text = result.response.text();
      parsed = JSON.parse(text) as AiSalesOrderResultDto[];
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      if (finishReason && finishReason !== 'STOP') {
        this.logger.error(`작업지시서 AI 분석 실패 — 응답이 잘림(finishReason=${finishReason}, 경과 ${elapsedMs}ms)`);
        throw new UnprocessableEntityException('분석 결과가 너무 길어 중간에 잘렸습니다. 페이지를 나눠 다시 올려 주세요.');
      }
      this.logger.error(`작업지시서 AI 분석 실패 — 응답 파싱 오류(경과 ${elapsedMs}ms): ${(err as Error).message}`);
      throw new InternalServerErrorException('작업지시서 AI 분석에 실패했습니다.');
    }

    this.applyTargetRddValidation(parsed);
    this.applyMidoCmtPriceGuard(parsed);
    this.applyGuardrails(parsed, context, todayKstIso());

    // 페이지 수 = 결과 배열 길이(스타일 1개 = 페이지 1개)로 근사한다 — 실측 검증 완료
    // (6페이지 파일→6건, 16페이지 파일→16건 정확히 일치, PR-055 참고).
    // outputTokens = totalTokenCount - promptTokenCount로 계산한다: SDK 타입 정의에
    // thoughtsTokenCount가 아직 없지만(실제 API 응답에는 존재) 이 뺄셈이 candidates+
    // thoughts를 정확히 포함한다는 걸 실측으로 확인했고, Google이 과금 대상 출력 항목을
    // 추가해도 계속 정확하다.
    const usageMetadata = result.response.usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount ?? 0;
    const totalTokens = usageMetadata?.totalTokenCount ?? 0;
    const usage: AiAnalysisUsage = {
      pageCount: parsed.length,
      promptTokens,
      outputTokens: Math.max(0, totalTokens - promptTokens),
    };
    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `작업지시서 분석 완료 — 경과 ${elapsedMs}ms, finishReason=${finishReason ?? 'STOP'}, promptTokens=${promptTokens}, outputTokens=${usage.outputTokens}, 결과=${parsed.length}건, model=${modelUsed}${fallbackUsed ? '(fallback)' : ''}`,
    );
    return { results: parsed, usage, isMock: false, modelUsed, fallbackUsed };
  }

  private buildModel(modelName: string) {
    // PR-192 보완: 시도별 타임아웃은 여기서 고정하지 않고 generateWithRetry가 매 시도마다
    // 남은 예산을 generateContent(parts, { timeout })로 직접 넘긴다 — 모델 생성 시
    // 고정값을 주면(이전 버전의 버그) 시도마다 전체 240초가 다시 적용돼 "전체 예산 공유"가
    // 지켜지지 않는다.
    return this.genAI!.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
        maxOutputTokens: 65536,
      },
    });
  }

  private isTimeoutError(err: unknown): boolean {
    if (err instanceof GoogleGenerativeAIAbortError) return true;
    const name = (err as any)?.name;
    const message = (err as Error)?.message || '';
    return name === 'AbortError' || /abort(ed)?|timeout/i.test(message);
  }

  // Gemini가 일시적으로 과부하(503)이거나 rate limit(429)에 걸리는 경우가 실제로 발생한다
  // (PR-055/PR-192 실측 확인) — 과금되는 유료 기능이 일시적 오류로 그냥 실패하지 않도록
  // 재시도한다. 그 외 에러(404 모델명 오류, 400 잘못된 요청, 타임아웃)는 재시도해도
  // 소용없으므로 즉시 던진다. deadlineAt(이 단계가 끝나야 하는 절대 시각)을 넘기지 않도록
  // 매 시도마다 "남은 예산"을 계산해 그 시도의 generateContent timeout으로 그대로 넘기고
  // (PR-192 보완 — 이전에는 시도마다 전체 240초가 고정으로 다시 적용돼 "전체 예산 공유"가
  // 지켜지지 않았다), 다음 대기까지 포함해 deadlineAt을 넘으면 더 기다리지 않고 바로
  // 실패 처리한다(retriesExhausted 플래그로 상위에 알림).
  private async generateWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    parts: any[],
    startedAt: number,
    deadlineAt: number,
    modelLabel: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < MIN_ATTEMPT_TIMEOUT_MS) {
        const elapsedMs = Date.now() - startedAt;
        this.logger.warn(`[${modelLabel}] 이 단계에 남은 예산(${remainingMs}ms)이 부족해 재시도 중단(경과 ${elapsedMs}ms)`);
        throw Object.assign(new Error(`[${modelLabel}] 남은 예산 부족으로 재시도 중단`), { retriesExhausted: true });
      }
      try {
        return await model.generateContent(parts, { timeout: remainingMs });
      } catch (err) {
        if (this.isTimeoutError(err)) {
          throw err;
        }
        const message = (err as Error).message || '';
        const status = (err as any)?.status;
        const isTransient = status === 503 || status === 429 || /\[(503|429)/.test(message);
        const elapsedMs = Date.now() - startedAt;
        if (!isTransient) {
          throw err;
        }
        if (attempt >= RETRY_DELAYS_MS.length) {
          this.logger.warn(`[${modelLabel}] 재시도(${attempt}회) 소진(경과 ${elapsedMs}ms): ${message}`);
          throw Object.assign(err as Error, { retriesExhausted: true });
        }
        const delay = RETRY_DELAYS_MS[attempt];
        if (Date.now() + delay > deadlineAt) {
          this.logger.warn(
            `[${modelLabel}] 다음 대기(${delay}ms)를 포함하면 이 단계의 시간 예산을 넘어 재시도 중단(경과 ${elapsedMs}ms)`,
          );
          throw Object.assign(err as Error, { retriesExhausted: true });
        }
        this.logger.warn(`[${modelLabel}] Gemini 일시적 오류(${attempt + 1}번째 재시도, ${delay}ms 대기, 경과 ${elapsedMs}ms): ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // PR-158: AI 프롬프트 지시만으로는 targetRdd/documentDate 혼동(실사례: "12/30" 납기를
  // 작성일 "6/22"로 잘못 인식)을 100% 막을 수 없어, 응답을 받은 뒤 코드로 결정적으로
  // 재검증한다 — 의심스러우면 targetRddSuspicious=true로 표시해 화면에서 경고한다.
  private applyTargetRddValidation(results: AiSalesOrderResultDto[]): void {
    const today = todayKstIso();
    for (const result of results) {
      // PR-190 보강: 의심 여부를 계산하기 전에 연도 보정부터 적용한다 — 기준은 "오늘(한국
      // 시간) 날짜"다(실사례: MB74BLM107, 작성일 2026-01-01/납기 2026-02-17로 인식, 조회
      // 시점 오늘 2026-10-14 기준 이미 지난 날짜 → 2027-02-17로 보정). 작성일 값 자체는
      // 절대 읽어서 바꾸지 않는다 — 납기==작성일(PR-158의 혼동 패턴)인 경우만 예외로
      // 보정하지 않는다(의심 경고만 유지).
      const rawTargetRdd = result.overview.targetRdd;
      const rollover = rolloverTargetRddYear(rawTargetRdd, result.overview.documentDate, today);
      result.overview.targetRdd = rollover.targetRdd;
      result.overview.targetRddYearAdjusted = rollover.adjusted;
      result.overview.targetRddOriginal = rollover.adjusted ? rollover.original : null;
      result.overview.targetRddAdjustBasis = rollover.adjusted ? rollover.basis : null;
      // PR-201d: 값을 안 바꿨어도 납기가 오늘보다 과거면 반드시 안내가 뜨게 한다
      // (targetRddYearAdjusted만 보면 "값은 안 바꿨고 조용히 넘어간" 경우가 생겼었다).
      result.overview.targetRddNotice = rollover.notice;

      // PR-207: documentDate와의 "잘못 읽음" 비교는 보정 전 원본(rawTargetRdd)으로 한다 —
      // 이제 보정이 항상 미래로 밀어 올리므로, 보정된 값으로 비교하면 PR-158의 misread
      // 패턴(targetRdd==documentDate)이 가려진다(target-rdd-validation.util.ts 참고).
      result.overview.targetRddSuspicious = isSuspiciousTargetRdd(
        result.overview.targetRdd,
        result.overview.documentDate,
        today,
        rawTargetRdd,
      );
    }
  }

  // PR-168: 프롬프트 지시("미도 건에만 채워라")만으로는 AI가 조건을 놓치고 다른
  // 바이어 건에도 값을 채울 위험이 있다(PR-158의 targetRdd/documentDate 혼동과 같은
  // 종류) — 바이어가 미도인지 코드로 결정적으로 재확인해, 아니면 AI가 뭘 반환했든
  // 무조건 null로 덮어쓴다. cmtPrice(사람이 확인한 최종값)는 AI가 채우는 필드가
  // 아니므로 항상 null로 초기화한다(검토 화면에서 "이 값 사용"을 눌러야 채워짐).
  private applyMidoCmtPriceGuard(results: AiSalesOrderResultDto[]): void {
    for (const result of results) {
      if (!isMidoBuyer(result.overview.buyer)) {
        result.overview.handwrittenCmtPriceCandidate = null;
        result.overview.handwrittenCmtPriceMemo = null;
      }
      result.overview.cmtPrice = null;
    }
  }

  // PR-200: AI 응답에 경고만 붙인다(값은 바꾸지 않음 — 예외: 스타일번호 대소문자 정리,
  // "공급사)자재명" 분리는 추측이 아니라 형식 해석이라 허용한다). 저장 경로
  // (commitAnalysis → mapping-commit)는 이 메서드가 채운 필드를 읽지 않는다(DTO에서
  // 매핑하지 않음 — 사람이 확정한 값만 저장).
  private applyGuardrails(results: AiSalesOrderResultDto[], context: VisionGuardrailContext, today: string): void {
    const knownStyleNos = context.knownStyleNos ?? [];

    for (const result of results) {
      const overviewWarnings: VisionWarning[] = [];

      const styleCheck = checkStyleNo(result.overview.styleNo, knownStyleNos);
      result.overview.styleNo = styleCheck.styleNo;
      if (styleCheck.rawStyleNo) result.overview.rawStyleNo = styleCheck.rawStyleNo;
      overviewWarnings.push(...styleCheck.warnings);

      const dateWarning = checkDocumentDateSuspicious(result.overview.documentDate, today);
      if (dateWarning) overviewWarnings.push(dateWarning);
      if (overviewWarnings.length > 0) result.overview.warnings = overviewWarnings;

      const perItemWarnings: VisionWarning[][] = result.bomItems.map(() => []);

      result.bomItems.forEach((item, idx) => {
        const warnings = perItemWarnings[idx];

        const split = splitSupplierItemName(item.itemName);
        if (split) {
          item.rawItemName = item.itemName;
          item.supplierName = split.supplierName;
          item.itemName = split.itemName;
          warnings.push({ code: 'SUPPLIER_NAME_SPLIT', message: `공급사/자재명을 분리했습니다(원문: ${item.rawItemName})` });

          const unknownSupplier = checkUnknownName(item.supplierName, context.supplierNames ?? [], 'UNKNOWN_SUPPLIER');
          if (unknownSupplier) warnings.push(unknownSupplier);
        }

        const unknownName = checkUnknownName(item.itemName, context.masterItemNames ?? []);
        if (unknownName) warnings.push(unknownName);
      });

      // PR-201(운영 화면 확인): 같은 겉감 자재가 색상별로 행이 나뉘어 있으면 출고량
      // (requiredQty)도 색상별 값이라 행 하나씩 "요척×총수량"과 비교하면 오탐이 난다 —
      // 공급사 분리가 끝난 뒤(최종 itemName 기준) 구분+자재명+요척이 같은 행을 묶어서,
      // 묶음이 2행 이상이면 합으로 비교하고(제안 버튼은 만들지 않음), 1행이면 기존과
      // 똑같이 행 하나로 비교한다(단일 행 동작은 바꾸지 않음).
      const yocheokGroups = groupBomItemsForYocheok(
        result.bomItems.map((b) => ({ category: b.category, itemName: b.itemName, consumption: b.consumption })),
      );
      for (const group of yocheokGroups) {
        if (group.length >= 2) {
          const bundleWarning = checkYocheokMismatchBundle(
            group.map((idx) => result.bomItems[idx]),
            result.overview.totalQty,
          );
          if (bundleWarning) {
            for (const idx of group) perItemWarnings[idx].push(bundleWarning);
          }
        } else {
          const idx = group[0];
          const item = result.bomItems[idx];
          const yocheokWarning = checkYocheokMismatch(item.consumption, result.overview.totalQty, item.requiredQty);
          if (yocheokWarning) perItemWarnings[idx].push(yocheokWarning);
        }
      }

      result.bomItems.forEach((item, idx) => {
        if (perItemWarnings[idx].length > 0) item.warnings = perItemWarnings[idx];
      });

      for (const group of findDuplicateGroups(result.bomItems)) {
        const warning: VisionWarning = {
          code: 'POSSIBLE_DUPLICATE',
          message: '같은 줄이 다른 이름으로 중복 인식됐을 수 있습니다',
          suggestions: group.map(String),
        };
        for (const idx of group) {
          const item = result.bomItems[idx];
          item.warnings = [...(item.warnings ?? []), warning];
        }
      }
    }
  }

  private mockResult(): AiSalesOrderResultDto[] {
    return [
      {
        overview: {
          styleNo: 'MB6YSLM115Z',
          styleName: null,
          itemType: 'PANTS',
          brand: '미센스',
          productionType: null,
          factory: null,
          buyer: null,
          totalQty: null,
          targetRdd: null,
          documentDate: null,
          targetRddSuspicious: false,
          handwrittenCmtPriceCandidate: null,
          handwrittenCmtPriceMemo: null,
          cmtPrice: null,
        },
        bomItems: [
          { category: null, itemName: '원단-폴리', spec: '150cm', colorCode: null, consumption: 1.5, requiredQty: null, supplier: null, remarks: null, materialSubTypeCandidate: null },
          { category: null, itemName: '지퍼', spec: '20cm', colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null, materialSubTypeCandidate: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      },
    ];
  }
}
