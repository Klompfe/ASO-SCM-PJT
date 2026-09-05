import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { AiWorkOrderResultDto } from './dto/ai-analysis.dto';

export interface AiAnalysisUsage {
  pageCount: number;
  promptTokens: number;
  outputTokens: number; // candidatesTokenCount + thoughtsTokenCount
}

export interface AiAnalysisOutcome {
  results: AiWorkOrderResultDto[];
  usage: AiAnalysisUsage;
}

const RESPONSE_SCHEMA = {
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
          targetRdd: { type: SchemaType.STRING, nullable: true, description: 'YYYY-MM-DD' },
        },
        required: ['styleNo', 'styleName', 'itemType', 'brand', 'productionType', 'factory', 'buyer', 'totalQty', 'targetRdd'],
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

const PROMPT = `이 문서는 의류 제조업체의 "작업지시서"입니다. 여러 페이지가 있을 수 있고, 각 페이지(또는 각 스타일)마다 하나의 결과 항목을 배열로 반환하세요.

각 항목은 아래 3가지로 구분해서 추출합니다:

1. overview(오더개요): Style NO., 스타일명, ITEM(품목 종류), 브랜드(문서 하단 회사명이 아니라 상표/브랜드), 임가공 구분(완사입=FOB, CMT=CMT), 소재(원단) 공장/생산처, 바이어, TOTAL 수량, 계획DELI의 납기 날짜(YYYY-MM-DD로 변환, 연도가 안 보이면 문서 상단 작성일 기준으로 추정).

2. bomItems(자재명세): 상단 소재 표(소재No./소재명/색상/규격/요척/출고량)와 하단 부자재 표(안감/심지/포켓감/테이프/재봉사/단추/라벨 등, 규격/소요량/비고)를 모두 각 행 하나씩 bomItems 배열 항목으로 변환하세요. category는 소재/안감/심지/부자재 등 표의 구분명, itemName은 소재명 또는 부자재명, spec은 규격/색상, consumption은 요척 또는 소요량(숫자만, 단위 제외).

3. sizeSpecs(작업명세 - 사이즈 스펙표): "SIZE" 표(부위별 지시서/견본/증감/완성 값 x 사이즈 0/1/2/Free 등 컬럼)를 부위 x 사이즈 조합마다 한 행씩 변환하세요. 값이 손글씨 분수(예: 32½)면 그대로 문자열로 옮기세요. 빈 칸은 null로 두세요.

4. workNotes(작업명세 - 지시사항): 옷 스케치 주변에 손글씨로 적힌 봉제 방식, 라벨 위치, 후가공 지시, 특이사항 등을 사람이 읽을 수 있는 자유 텍스트로 요약하세요. 구조화하지 말고 문단/목록 형태의 텍스트로 반환하세요.

읽을 수 없거나 문서에 없는 값은 null로 두고, 절대 지어내지 마세요.`;

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

  async analyzeWorkOrder(file: Express.Multer.File): Promise<AiAnalysisOutcome> {
    if (!this.genAI) {
      // 목업 응답은 실제 API 비용이 없으므로 pageCount=0으로 반환해 과금 로그를 남기지 않는다.
      return { results: this.mockResult(), usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 } };
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
        maxOutputTokens: 65536,
      },
    });

    try {
      const result = await this.generateWithRetry(model, [
        { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } },
        { text: PROMPT },
      ]);
      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        this.logger.warn(`Gemini 응답이 정상 종료되지 않음(finishReason=${finishReason}) - 응답이 잘렸을 수 있습니다.`);
      }
      const text = result.response.text();
      const parsed = JSON.parse(text) as AiWorkOrderResultDto[];

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
      return { results: parsed, usage };
    } catch (err) {
      this.logger.error(`Gemini 작업지시서 분석 실패: ${(err as Error).message}`);
      throw new InternalServerErrorException('작업지시서 AI 분석에 실패했습니다.');
    }
  }

  // Gemini가 일시적으로 과부하(503)이거나 rate limit(429)에 걸리는 경우가 실제로 발생한다
  // (PR-055 실측 확인) — 과금되는 유료 기능이 일시적 오류로 그냥 실패하지 않도록 짧게
  // 재시도한다. 그 외 에러(404 모델명 오류, 400 잘못된 요청 등)는 재시도해도 소용없으므로
  // 즉시 던진다.
  private async generateWithRetry(model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>, parts: any[]) {
    const delaysMs = [2000, 5000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await model.generateContent(parts);
      } catch (err) {
        const message = (err as Error).message || '';
        const isTransient = /\[(503|429)/.test(message);
        if (!isTransient || attempt >= delaysMs.length) {
          throw err;
        }
        this.logger.warn(`Gemini 일시적 오류(${attempt + 1}번째 재시도 대기 중): ${message}`);
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }

  private mockResult(): AiWorkOrderResultDto[] {
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
        },
        bomItems: [
          { category: null, itemName: '원단-폴리', spec: '150cm', colorCode: null, consumption: 1.5, requiredQty: null, supplier: null, remarks: null },
          { category: null, itemName: '지퍼', spec: '20cm', colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      },
    ];
  }
}
