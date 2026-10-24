import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GatewayTimeoutException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { VisionService, todayKstIso } from './vision.service';

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
    // PR-175: 목업도 실제 응답과 같은 shape을 가져야 한다 — materialSubTypeCandidate는
    // AI가 채우는 필드가 아니므로 목업에서도 항상 null.
    expect(outcome.results[0].bomItems.every((b: any) => b.materialSubTypeCandidate === null)).toBe(true);
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
    // PR-200: 'REAL-STYLE'은 실제 스타일번호 형식(MB|MBS|LB|VB...)이 아니라 서버 후처리가
    // STYLE_NO_FORMAT 경고를 붙인다(후보는 접두를 못 찾아 빈 배열 — 값 자체는 안 바뀜).
    expect(outcome.results).toEqual([
      {
        ...fakeParsedResult[0],
        overview: {
          ...fakeParsedResult[0].overview,
          targetRddYearAdjusted: false, targetRddOriginal: null, targetRddAdjustBasis: null, targetRddNotice: 'none', targetRddSuspicious: false,
          handwrittenCmtPriceCandidate: null, handwrittenCmtPriceMemo: null, cmtPrice: null,
          warnings: [{ code: 'STYLE_NO_FORMAT', message: '스타일번호 형식이 맞지 않습니다 — 원본과 대조해 주세요', suggestions: [] }],
        },
      },
    ]);
    expect(outcome.usage).toEqual({ pageCount: 1, promptTokens: 100, outputTokens: 200 });
  });
});

// PR-200: 작지 AI 판독 안전장치 — vision-guardrails.util.ts의 순수 함수들이
// analyzeSalesOrder 파이프라인에 실제로 연결돼 있는지(가짜 Gemini 응답으로 확인).
describe('VisionService.analyzeSalesOrder — PR-200 안전장치', () => {
  const buildServiceWithFakeResponse = async (parsedResult: any[], context?: any) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisionService, { provide: ConfigService, useValue: { get: jest.fn(() => 'fake-api-key') } }],
    }).compile();
    const service: VisionService = module.get(VisionService);
    const fakeGenerateContent = jest.fn().mockResolvedValue({
      response: {
        candidates: [{ finishReason: 'STOP' }],
        text: () => JSON.stringify(parsedResult),
        usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
      },
    });
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent: fakeGenerateContent })) };
    return service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any, context);
  };

  const baseOverview = { styleNo: 'MB00AAA000Z', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: 80, targetRdd: null, documentDate: null };

  it('공급사)자재명 형식을 분리하고 원문을 rawItemName에 남긴다(값을 지어내지 않음)', async () => {
    const outcome = await buildServiceWithFakeResponse([
      { overview: baseOverview, bomItems: [{ category: null, itemName: '르카이)KL-R114', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null }], sizeSpecs: [], workNotes: null },
    ]);
    const item = outcome.results[0].bomItems[0] as any;
    expect(item.itemName).toBe('KL-R114');
    expect(item.supplierName).toBe('르카이');
    expect(item.rawItemName).toBe('르카이)KL-R114');
  });

  it('마스터에 없는 자재명이면 UNKNOWN_NAME + 한 글자 차이 후보를 붙인다', async () => {
    const outcome = await buildServiceWithFakeResponse(
      [{ overview: baseOverview, bomItems: [{ category: null, itemName: 'KL-R326', spec: null, colorCode: null, consumption: 1.5, requiredQty: null, supplier: null, remarks: null }], sizeSpecs: [], workNotes: null }],
      { masterItemNames: ['KL-R926'] },
    );
    const item = outcome.results[0].bomItems[0] as any;
    expect(item.itemName).toBe('KL-R326'); // 자동 교체 없음
    expect(item.warnings).toEqual([{ code: 'UNKNOWN_NAME', message: expect.any(String), suggestions: ['KL-R926'] }]);
  });

  it('같은 구분·규격·요척 행이 3개면 POSSIBLE_DUPLICATE로 묶는다', async () => {
    const dupItem = (name: string) => ({ category: '봉사', itemName: name, spec: null, colorCode: null, consumption: 20, requiredQty: null, supplier: null, remarks: null });
    const outcome = await buildServiceWithFakeResponse(
      [{ overview: baseOverview, bomItems: [dupItem('스쿠이사'), dupItem('스판사'), dupItem('스팽사')], sizeSpecs: [], workNotes: null }],
      { masterItemNames: ['스쿠이사', '스판사', '스팽사'] },
    );
    const items = outcome.results[0].bomItems as any[];
    for (const item of items) {
      expect(item.warnings?.some((w: any) => w.code === 'POSSIBLE_DUPLICATE')).toBe(true);
    }
  });

  it('요척×수량이 출고량과 안 맞으면 경고를 붙이지만(PR-201c부터) 역산 제안은 만들지 않는다(요척 탓으로 단정 안 함)', async () => {
    const outcome = await buildServiceWithFakeResponse(
      [{ overview: baseOverview, bomItems: [{ category: null, itemName: '가짜자재', spec: null, colorCode: null, consumption: 1.24, requiredQty: 97, supplier: null, remarks: null }], sizeSpecs: [], workNotes: null }],
      { masterItemNames: ['가짜자재'] },
    );
    const item = outcome.results[0].bomItems[0] as any;
    expect(item.warnings[0].code).toBe('YOCHEOK_QTY_MISMATCH');
    expect(item.warnings[0].message).not.toContain('수량이 다릅니다');
    expect(item.warnings[0].suggestions).toBeUndefined();
  });

  it('스타일번호 끝 글자가 숫자면 저장 전 확인용 경고가 overview에 붙는다(값은 안 바뀜)', async () => {
    const outcome = await buildServiceWithFakeResponse([
      { overview: { ...baseOverview, styleNo: 'MB00AAA0002' }, bomItems: [], sizeSpecs: [], workNotes: null },
    ]);
    const overview = outcome.results[0].overview as any;
    expect(overview.styleNo).toBe('MB00AAA0002');
    expect(overview.warnings[0].code).toBe('STYLE_NO_LAST_DIGIT');
  });

  it('정상 값들은 경고가 붙지 않는다(오탐 방지)', async () => {
    const outcome = await buildServiceWithFakeResponse(
      [{ overview: baseOverview, bomItems: [{ category: null, itemName: '정상자재', spec: null, colorCode: null, consumption: 1.2, requiredQty: null, supplier: null, remarks: null }], sizeSpecs: [], workNotes: null }],
      { masterItemNames: ['정상자재'] },
    );
    expect((outcome.results[0].overview as any).warnings).toBeUndefined();
    expect((outcome.results[0].bomItems[0] as any).warnings).toBeUndefined();
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

  // PR-190 실사례(MB74BLM107)였던 테스트 — PR-201에서 기준을 "오늘"에서 "작성일(신뢰
  // 가능하면)"로 되돌렸다. 작성일 2026-01-01이 의심스럽지 않은(미래/18개월초과과거 아님)
  // 날짜이므로 이제는 작성일을 기준으로 삼고, 납기 2026-02-17은 작성일보다 뒤라 보정하지
  // 않는다(조회 시점이 2026-10-14라서 "오늘보다 과거"였을 뿐, 문서 자체로는 정상인
  // 근거리 납기였다 — PR-201 배경의 "작성일이 과거인 작지" 패턴과 구조가 같다).
  it('작성일이 의심스럽지 않고 납기가 작성일보다 뒤면 — 조회 시점이 나중이라도 보정하지 않는다(PR-201, 기준 작성일로 변경)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T03:00:00Z')); // KST 2026-10-14 12:00
    try {
      const service = await buildServiceWithFakeResponse({
        styleNo: 'MB74BLM107', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
        targetRdd: '2026-02-17', documentDate: '2026-01-01',
      });
      const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
      expect(outcome.results[0].overview.targetRdd).toBe('2026-02-17');
      expect(outcome.results[0].overview.targetRddYearAdjusted).toBe(false);
      expect(outcome.results[0].overview.targetRddOriginal).toBeNull();
      // PR-201d: 값은 안 바꿨지만 2026-02-17이 오늘(2026-10-14)보다 과거라 past-kept 안내.
      expect(outcome.results[0].overview.targetRddNotice).toBe('past-kept');
      expect(outcome.results[0].overview.documentDate).toBe('2026-01-01'); // 작성일은 절대 건드리지 않는다
    } finally {
      jest.useRealTimers();
    }
  });

  // PR-201 배경 실사례: 작성일이 과거(보관/시험 문서)인 작지는 납기도 오늘보다 과거일 수
  // 있다 — 작성일 기준으로는 보정이 필요 없는데 "오늘" 기준으로만 보면 틀리게 보정된다.
  it('작성일이 과거이고 납기가 작성일보다 뒤·오늘보다 앞이면 보정하지 않는다(PR-201 배경 실사례 패턴)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T03:00:00Z'));
    try {
      const service = await buildServiceWithFakeResponse({
        styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
        targetRdd: '2026-03-17', documentDate: '2025-09-08',
      });
      const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
      expect(outcome.results[0].overview.targetRdd).toBe('2026-03-17');
      expect(outcome.results[0].overview.targetRddYearAdjusted).toBe(false);
      expect(outcome.results[0].overview.targetRddAdjustBasis).toBeNull();
      // PR-201d: 2026-03-17이 오늘(2026-10-23)보다 과거라 past-kept 안내(PR-201c ③에서
      // 확인된 사각지대 — 값은 안 바꿔도 반드시 안내가 뜨게 한다).
      expect(outcome.results[0].overview.targetRddNotice).toBe('past-kept');
    } finally {
      jest.useRealTimers();
    }
  });

  it('작성일이 의심스러운 날짜(18개월 초과 과거)이면 여전히 오늘을 기준으로 보정한다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T03:00:00Z'));
    try {
      const service = await buildServiceWithFakeResponse({
        styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
        targetRdd: '2026-02-17', documentDate: '2020-01-01', // 18개월 넘게 과거 — 신뢰 불가
      });
      const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
      expect(outcome.results[0].overview.targetRdd).toBe('2027-02-17');
      expect(outcome.results[0].overview.targetRddYearAdjusted).toBe(true);
      expect(outcome.results[0].overview.targetRddAdjustBasis).toBe('TODAY');
      expect(outcome.results[0].overview.targetRddNotice).toBe('bumped-today');
    } finally {
      jest.useRealTimers();
    }
  });

  it('납기가 아직 미래이고 작성일보다만 이르면(의도된 변화) 더 이상 보정하지 않고 의심 경고만 유지한다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T03:00:00Z'));
    try {
      const service = await buildServiceWithFakeResponse({
        styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
        targetRdd: '2026-12-30', documentDate: '2026-01-01',
      });
      const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
      expect(outcome.results[0].overview.targetRdd).toBe('2026-12-30');
      expect(outcome.results[0].overview.targetRddYearAdjusted).toBe(false);
      expect(outcome.results[0].overview.targetRddOriginal).toBeNull();
      // 2026-12-30은 오늘(2026-10-14)보다 미래라 안내 없음.
      expect(outcome.results[0].overview.targetRddNotice).toBe('none');
    } finally {
      jest.useRealTimers();
    }
  });

  it('보정이 일어나지 않으면 targetRddYearAdjusted:false, targetRddOriginal:null이다(기존 미래 날짜 케이스)', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 200).toISOString().slice(0, 10);
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null,
      targetRdd: future, documentDate: '2026-01-01',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.targetRddYearAdjusted).toBe(false);
    expect(outcome.results[0].overview.targetRddOriginal).toBeNull();
  });
});

// PR-190 보강: "오늘" 계산이 UTC가 아니라 반드시 한국시간(KST, UTC+9) 기준이어야 한다 —
// new Date().toISOString()(UTC)를 그대로 쓰면 한국 00:00~09:00 사이에 어제 날짜로
// 계산되는 버그가 있었다. todayKstIso()의 자정 경계를 직접 검증한다.
describe('todayKstIso — 한국시간(KST) 자정 경계 (PR-190 보강)', () => {
  it('UTC 2026-10-13T16:00:00Z(KST 2026-10-14 01:00)는 오늘을 2026-10-14로 계산한다', () => {
    expect(todayKstIso(new Date('2026-10-13T16:00:00Z'))).toBe('2026-10-14');
  });

  it('UTC 2026-10-14T14:59:00Z(KST 2026-10-14 23:59)는 아직 2026-10-14다', () => {
    expect(todayKstIso(new Date('2026-10-14T14:59:00Z'))).toBe('2026-10-14');
  });

  it('UTC 2026-10-14T15:00:00Z(KST 2026-10-15 00:00, 자정을 막 넘김)는 2026-10-15로 넘어간다', () => {
    expect(todayKstIso(new Date('2026-10-14T15:00:00Z'))).toBe('2026-10-15');
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

  // PR-181: handwrittenCmtPriceMemo(수기 표기 원문, 계산식이면 식 전체)도 candidate와
  // 같은 미도 가드를 받는다 — 계산식 예시("7,270 + 230 = 7,500")로 candidate=합계,
  // memo=식 원문이 그대로 보존되는지까지 함께 확인한다.
  it('바이어가 미도면 계산식 메모(handwrittenCmtPriceMemo)를 원문 그대로 둔다(candidate는 합계)', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: '미도컴퍼니', totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: '7,270 + 230 = 7,500',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.handwrittenCmtPriceCandidate).toBe(7500);
    expect(outcome.results[0].overview.handwrittenCmtPriceMemo).toBe('7,270 + 230 = 7,500');
  });

  it('바이어가 미도가 아니면 handwrittenCmtPriceMemo도 강제로 null로 덮어쓴다', async () => {
    const service = await buildServiceWithFakeResponse({
      styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null,
      buyer: '빈폴코리아', totalQty: null, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: 9999, handwrittenCmtPriceMemo: '9,999',
    });
    const outcome = await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(outcome.results[0].overview.handwrittenCmtPriceMemo).toBeNull();
  });
});

// PR-192: Gemini 503 과부하 실측(Render 로그, 2026-10-13) 대응 — 재시도 강화, 모델
// 폴백, 타임아웃/잘림 전용 에러, 로그에 작지 내용이 안 남는지까지 검증한다.
describe('VisionService.analyzeSalesOrder — 503 재시도/폴백/타임아웃 (PR-192)', () => {
  const configValues: Record<string, string | undefined> = {
    GEMINI_API_KEY: 'fake-key',
    GEMINI_MODEL: undefined,
    GEMINI_FALLBACK_MODEL: undefined,
  };

  const buildService = async (): Promise<any> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisionService,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => configValues[key]) } },
      ],
    }).compile();
    return module.get(VisionService);
  };

  const fakeParsedResult = [
    { overview: { styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null }, bomItems: [], sizeSpecs: [], workNotes: null },
  ];
  const successResponse = () => ({
    response: {
      candidates: [{ finishReason: 'STOP' }],
      text: () => JSON.stringify(fakeParsedResult),
      usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
    },
  });
  const fetchError503 = () => Object.assign(new Error('[503 Service Unavailable] This model is currently experiencing high demand'), { status: 503 });

  beforeEach(() => {
    configValues.GEMINI_MODEL = undefined;
    configValues.GEMINI_FALLBACK_MODEL = undefined;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('503이 몇 번 발생해도 중간에 성공하면 정상 결과를 반환한다(재시도 대기 실제 소요)', async () => {
    const service = await buildService();
    const generateContent = jest.fn()
      .mockRejectedValueOnce(fetchError503())
      .mockResolvedValueOnce(successResponse());
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    await jest.advanceTimersByTimeAsync(5000); // 첫 재시도 대기(5000ms)
    const outcome = await promise;

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(outcome.isMock).toBe(false);
    expect(outcome.results[0].overview.styleNo).toBe('S');
    expect(outcome.modelUsed).toBe('gemini-3.6-flash');
    expect(outcome.fallbackUsed).toBe(false);
  });

  it('503이 4번 연속(최대 시도) 발생하고 폴백 모델이 없으면 503 혼잡 메시지로 실패한다', async () => {
    const service = await buildService();
    const generateContent = jest.fn().mockRejectedValue(fetchError503());
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any).catch((e: Error) => e);
    // 3번의 재시도 대기(5000+15000+30000=50000ms)를 모두 흘려보낸다
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15000);
    await jest.advanceTimersByTimeAsync(30000);
    const err = await promise;

    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).message).toContain('AI 서버가 일시적으로 혼잡합니다');
  });

  it('전체 경과시간이 240초를 넘기면 다음 대기를 기다리지 않고 즉시 재시도를 중단한다', async () => {
    const service = await buildService();
    let callCount = 0;
    const generateContent = jest.fn().mockImplementation(() => {
      callCount++;
      // 2번째 시도까지는 실제로 과거 시각을 흐르게 해 "경과시간"이 240초에 거의 다다르도록 만든다.
      if (callCount === 2) {
        jest.advanceTimersByTime(235_000);
      }
      return Promise.reject(fetchError503());
    });
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(5000); // 1번째 재시도 대기만 소진
    const err = await promise;

    // 2번째 시도 이후 경과시간(235s) + 다음 대기(15s) > 240s 한도라 3번째 시도 없이 중단된다.
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
  });

  it('GEMINI_FALLBACK_MODEL이 설정되어 있으면 기본 모델 재시도 소진 후 폴백 모델로 1회 더 시도해 성공할 수 있다', async () => {
    configValues.GEMINI_MODEL = 'gemini-primary';
    configValues.GEMINI_FALLBACK_MODEL = 'gemini-fallback';
    const service = await buildService();
    const primaryGenerateContent = jest.fn().mockRejectedValue(fetchError503());
    const fallbackGenerateContent = jest.fn().mockResolvedValue(successResponse());
    const getGenerativeModel = jest.fn((params: { model: string }) =>
      params.model === 'gemini-fallback' ? { generateContent: fallbackGenerateContent } : { generateContent: primaryGenerateContent },
    );
    (service as any).genAI = { getGenerativeModel };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15000);
    await jest.advanceTimersByTimeAsync(30000);
    const outcome = await promise;

    expect(primaryGenerateContent).toHaveBeenCalledTimes(4);
    expect(fallbackGenerateContent).toHaveBeenCalledTimes(1);
    expect(outcome.modelUsed).toBe('gemini-fallback');
    expect(outcome.fallbackUsed).toBe(true);
    expect(outcome.results[0].overview.styleNo).toBe('S');
  });

  // PR-192 보완: buildModel()이 시도마다 고정 240초를 넘기던 버그 수정 — 매 시도의
  // generateContent timeout이 "이 단계에 남은 예산"과 같아야 하고(검증 ③), 폴백 모델이
  // 설정된 경우 기본 모델 단계는 96초(전체 예산의 40%)에서 끊겨야 한다(검증 ①).
  it('기본 모델 응답이 느려(실측처럼 90초 가까이 걸려) 96초 단계 예산에 근접하면, 폴백 모델이 설정된 경우 더 기다리지 않고 폴백으로 전환한다', async () => {
    configValues.GEMINI_MODEL = 'gemini-primary';
    configValues.GEMINI_FALLBACK_MODEL = 'gemini-fallback';
    const service = await buildService();
    let primaryCallCount = 0;
    const primaryGenerateContent = jest.fn().mockImplementation(() => {
      primaryCallCount++;
      if (primaryCallCount === 1) {
        jest.advanceTimersByTime(90_000); // 실측처럼 503 자체가 90초 가까이 걸려 돌아온다고 가정
      }
      return Promise.reject(fetchError503());
    });
    const fallbackGenerateContent = jest.fn().mockResolvedValue(successResponse());
    const getGenerativeModel = jest.fn((params: { model: string }) =>
      params.model === 'gemini-fallback' ? { generateContent: fallbackGenerateContent } : { generateContent: primaryGenerateContent },
    );
    (service as any).genAI = { getGenerativeModel };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    await jest.advanceTimersByTimeAsync(5000); // 1번째 재시도 대기(5s, 누적 95s)만 소진된다
    const outcome = await promise;

    // 90s(1번째 응답) + 5s(재시도 대기) = 95s 시점에 남은 예산(96s 한도 - 95s = 1s)이
    // MIN_ATTEMPT_TIMEOUT_MS(10s) 미만이라 2번째 기본 모델 시도 자체를 시작하지 않고
    // 곧바로 폴백으로 전환된다(새 시도를 시작했다가 중간에 끊기는 것을 막기 위함).
    expect(primaryGenerateContent).toHaveBeenCalledTimes(1);
    expect(fallbackGenerateContent).toHaveBeenCalledTimes(1);
    expect(outcome.modelUsed).toBe('gemini-fallback');
    expect(outcome.fallbackUsed).toBe(true);
  });

  it('폴백 모델이 설정되어 있지 않으면 기본 모델이 느려도(90초 가까이) 96초가 아니라 전체 240초 예산을 그대로 쓴다(기존 동작과 동일)', async () => {
    const service = await buildService();
    let callCount = 0;
    const generateContent = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        jest.advanceTimersByTime(90_000);
      }
      return Promise.reject(fetchError503());
    });
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const promise = service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any).catch((e: Error) => e);
    // 폴백이 없으므로 240초 예산 안에서는 15s 대기도 그대로 진행된다(96초 단계 컷이 적용되지 않음).
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(15000);
    await jest.advanceTimersByTimeAsync(30000);
    const err = await promise;

    expect(generateContent).toHaveBeenCalledTimes(4); // 96초 컷 없이 최대 시도(4회)를 다 쓴다
    expect(err).toBeInstanceOf(ServiceUnavailableException);
  });

  it('각 generateContent 호출에 전달되는 timeout이 그 시점에 남은 예산과 같다(폴백 설정 시 1차 호출은 96초, 미설정 시 240초)', async () => {
    configValues.GEMINI_MODEL = 'gemini-primary';
    configValues.GEMINI_FALLBACK_MODEL = 'gemini-fallback';
    const serviceWithFallback = await buildService();
    const generateContentWithFallback = jest.fn().mockResolvedValue(successResponse());
    (serviceWithFallback as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent: generateContentWithFallback })) };
    await serviceWithFallback.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(generateContentWithFallback.mock.calls[0][1].timeout).toBe(96_000);

    configValues.GEMINI_MODEL = undefined;
    configValues.GEMINI_FALLBACK_MODEL = undefined;
    const serviceWithoutFallback = await buildService();
    const generateContentWithoutFallback = jest.fn().mockResolvedValue(successResponse());
    (serviceWithoutFallback as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent: generateContentWithoutFallback })) };
    await serviceWithoutFallback.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any);
    expect(generateContentWithoutFallback.mock.calls[0][1].timeout).toBe(240_000);
  });

  it('타임아웃(abort)으로 실패하면 재시도 없이 즉시 504 타임아웃 메시지로 실패한다', async () => {
    const service = await buildService();
    const abortError = Object.assign(new Error('Request aborted when fetching https://...: The user aborted a request.'), { name: 'AbortError' });
    const generateContent = jest.fn().mockRejectedValue(abortError);
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    await expect(
      service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any),
    ).rejects.toThrow(GatewayTimeoutException);
    expect(generateContent).toHaveBeenCalledTimes(1); // 재시도하지 않는다
  });

  it('finishReason이 STOP이 아니고 응답이 잘려 JSON 파싱에 실패하면 422로 실패한다', async () => {
    const service = await buildService();
    const generateContent = jest.fn().mockResolvedValue({
      response: {
        candidates: [{ finishReason: 'MAX_TOKENS' }],
        text: () => '{"overview": { 이 JSON은 잘렸습니다',
        usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
      },
    });
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    await expect(
      service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('로거에 파일 내용(base64)이 찍히지 않는다', async () => {
    const service = await buildService();
    const logSpy = jest.spyOn((service as any).logger, 'log');
    const generateContent = jest.fn().mockResolvedValue(successResponse());
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const base64Content = Buffer.from('이것은 작업지시서 내용입니다').toString('base64');
    await service.analyzeSalesOrder({ buffer: Buffer.from('이것은 작업지시서 내용입니다'), mimetype: 'image/png', originalname: 'order.png' } as any);

    const loggedText = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(loggedText).not.toContain(base64Content);
    expect(loggedText).toMatch(/file=order\.png/);
  });
});
