import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VisionService } from './vision.service';

// PR-096: GEMINI_API_KEY 미설정 시 목업 데이터를 반환하는 현재 동작 자체는 유지하되,
// 이 사실이 응답에 명시적으로 드러나는지(isMock)를 검증한다 — 기존에는
// usage.pageCount === 0로 간접 추론했는데, 이게 화면에 목업 여부가 전혀 안 보였던
// 원인이었다(PR-096 배경).
describe('VisionService.analyzeSalesOrder — isMock (PR-096)', () => {
  const buildService = async (apiKey: string | undefined): Promise<VisionService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisionService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => apiKey) },
        },
      ],
    }).compile();
    return module.get(VisionService);
  };

  it('GEMINI_API_KEY가 설정되지 않으면 isMock: true와 목업 결과를 반환해야 한다', async () => {
    const service = await buildService(undefined);

    const outcome = await service.analyzeSalesOrder({} as any);

    expect(outcome.isMock).toBe(true);
    expect(outcome.usage).toEqual({ pageCount: 0, promptTokens: 0, outputTokens: 0 });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].overview.styleNo).toBe('MB6YSLM115Z');
  });

  it('GEMINI_API_KEY가 빈 문자열이어도(falsy) isMock: true여야 한다', async () => {
    const service = await buildService('');

    const outcome = await service.analyzeSalesOrder({} as any);

    expect(outcome.isMock).toBe(true);
  });

  it('GEMINI_API_KEY가 설정되어 실제 Gemini 응답을 받으면 isMock: false여야 한다', async () => {
    const service = await buildService('fake-api-key-for-test');

    const fakeParsedResult = [
      { overview: { styleNo: 'REAL-STYLE', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null }, bomItems: [], sizeSpecs: [], workNotes: null },
    ];
    const fakeGenerateContent = jest.fn().mockResolvedValue({
      response: {
        candidates: [{ finishReason: 'STOP' }],
        text: () => JSON.stringify(fakeParsedResult),
        usageMetadata: { promptTokenCount: 100, totalTokenCount: 300 },
      },
    });
    // 실제 SDK 인스턴스를 만들지 않고, private 필드(genAI)를 테스트용 스텁으로 교체한다 —
    // 이 스텁 없이 실제 키로 네트워크 호출을 하면 유닛 테스트가 아니게 된다.
    (service as any).genAI = {
      getGenerativeModel: jest.fn(() => ({ generateContent: fakeGenerateContent })),
    };

    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);

    expect(outcome.isMock).toBe(false);
    // PR-158: analyzeSalesOrder()가 응답을 받은 뒤 targetRddSuspicious를 계산해 덧붙인다.
    // PR-168: handwrittenCmtPriceCandidate/cmtPrice 가드도 항상 적용된다(바이어가
    // null이라 미도로 인정되지 않으므로 candidate는 null, cmtPrice는 항상 null로 초기화).
    expect(outcome.results).toEqual([
      {
        ...fakeParsedResult[0],
        overview: { ...fakeParsedResult[0].overview, targetRddSuspicious: false, handwrittenCmtPriceCandidate: null, cmtPrice: null },
      },
    ]);
    expect(outcome.usage).toEqual({ pageCount: 1, promptTokens: 100, outputTokens: 200 });
  });
});

// PR-158: AI가 문서 상단 작성일을 납기로 잘못 인식한 실사례(targetRdd="6/22" ≈
// documentDate) 재발 방지 — 프롬프트만으로는 부족해 코드로 재검증한다.
describe('VisionService.analyzeSalesOrder — targetRddSuspicious 계산 (PR-158)', () => {
  const buildServiceWithFakeResponse = async (overview: Record<string, unknown>): Promise<any> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisionService, { provide: ConfigService, useValue: { get: jest.fn(() => 'fake-key') } }],
    }).compile();
    const service = module.get(VisionService);
    const fakeParsedResult = [{ overview, bomItems: [], sizeSpecs: [], workNotes: null }];
    (service as any).genAI = {
      getGenerativeModel: jest.fn(() => ({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            candidates: [{ finishReason: 'STOP' }],
            text: () => JSON.stringify(fakeParsedResult),
            usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
          },
        }),
      })),
    };
    return service;
  };

  it('납기가 문서작성일과 같으면(실사례 패턴) targetRddSuspicious: true로 표시한다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
      targetRdd: '2026-06-22', documentDate: '2026-06-22',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.targetRddSuspicious).toBe(true);
  });

  it('납기가 문서작성일/오늘보다 미래면 targetRddSuspicious: false다', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 200).toISOString().slice(0, 10); // +200일
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
      targetRdd: future, documentDate: '2026-01-01',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.targetRddSuspicious).toBe(false);
  });

  it('납기를 아예 못 읽었으면(null) targetRddSuspicious: false다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
      targetRdd: null, documentDate: '2026-01-01',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.targetRddSuspicious).toBe(false);
  });
});

// PR-168: 미도 전용 — 작업지시서 이미지 상단 수기 CMT단가 인식. 프롬프트 지시만으로는
// AI가 조건(미도 건에만)을 놓칠 수 있어, 바이어가 실제로 미도인지 코드로 재검증해
// 아니면 AI가 뭘 반환했든 무조건 null로 덮어쓴다(PR-158과 동일한 원칙).
describe('VisionService.analyzeSalesOrder — 미도 전용 수기 CMT단가 후보 가드 (PR-168)', () => {
  const buildServiceWithFakeResponse = async (overview: Record<string, unknown>): Promise<any> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisionService, { provide: ConfigService, useValue: { get: jest.fn(() => 'fake-key') } }],
    }).compile();
    const service = module.get(VisionService);
    const fakeParsedResult = [{ overview, bomItems: [], sizeSpecs: [], workNotes: null }];
    (service as any).genAI = {
      getGenerativeModel: jest.fn(() => ({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            candidates: [{ finishReason: 'STOP' }],
            text: () => JSON.stringify(fakeParsedResult),
            usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
          },
        }),
      })),
    };
    return service;
  };

  it('바이어가 미도면 AI가 반환한 handwrittenCmtPriceCandidate를 그대로 둔다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: '미도컴퍼니', totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 7500,
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.handwrittenCmtPriceCandidate).toBe(7500);
  });

  it('바이어가 미도가 아니면 AI가 값을 반환했어도(오인식) 코드가 강제로 null로 덮어쓴다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: '빈폴코리아', totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 9999, // AI가 조건을 무시하고 잘못 채운 경우를 재현
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.handwrittenCmtPriceCandidate).toBeNull();
  });

  it('바이어를 못 읽었으면(null) 항상 null이다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: null, totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 1234,
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.handwrittenCmtPriceCandidate).toBeNull();
  });

  it('cmtPrice(사람이 확인한 최종값)는 AI 응답에 뭐가 와도 항상 null로 초기화된다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: '미도컴퍼니', totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 7500, cmtPrice: 7500, // AI가 직접 cmtPrice를 채워 보내려 해도
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.cmtPrice).toBeNull();
  });
});
