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
      { overview: { styleNo: 'REAL-STYLE', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null }, bomItems: [], sizeSpecs: [], workNotes: null },
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
    expect(outcome.results).toEqual(fakeParsedResult);
    expect(outcome.usage).toEqual({ pageCount: 1, promptTokens: 100, outputTokens: 200 });
  });
});
