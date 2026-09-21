import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiUsageLogService } from './ai-usage-log.service';
import { AiUsageLog } from './entities/ai-usage-log.entity';

describe('AiUsageLogService', () => {
  let service: AiUsageLogService;

  const mockRepository = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 1, ...data })),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiUsageLogService,
        { provide: getRepositoryToken(AiUsageLog), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<AiUsageLogService>(AiUsageLogService);
  });

  describe('calculateCharge - 페이지 수 기준 과금표', () => {
    it.each([
      [1, 500],
      [5, 500],
      [6, 1000],
      [15, 1000],
      [16, 2000],
      [30, 2000],
      [31, 2050],
      [40, 2500],
    ])('%i페이지는 %i원으로 계산되어야 한다', (pageCount, expected) => {
      expect(service.calculateCharge(pageCount)).toBe(expected);
    });
  });

  describe('log', () => {
    it('실측 원가 공식대로 estimatedCostUsd를 계산해 저장해야 한다', async () => {
      // 실측(PR-054/055): 6페이지, promptTokens 3699, outputTokens 11765 => 약 $0.0469
      await service.log(1, 6, 3699, 11765);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          pageCount: 6,
          promptTokens: 3699,
          outputTokens: 11765,
          chargedAmountKrw: 1000,
        }),
      );
      const createdArg = mockRepository.create.mock.calls[0][0];
      expect(createdArg.estimatedCostUsd).toBeCloseTo(0.0469, 3);
    });
  });
});
