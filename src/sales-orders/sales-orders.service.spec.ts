import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SalesOrdersService } from './sales-orders.service';
import { VisionService } from './vision.service';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { SalesOrderSpecsService } from './sales-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';

// PR-133: WorkOrdersService에 섞여 있던 수주(작업지시서 업로드) 흐름의 테스트를 그대로 옮겼다(대상 서비스/메서드 이름만 바뀜).
describe('SalesOrdersService', () => {
  let service: SalesOrdersService;

  const mockVisionService = { analyzeSalesOrder: jest.fn() };
  const mockMappingCommitService = { commit: jest.fn() };
  const mockSalesOrderSpecsService = { save: jest.fn(), findByStyleNo: jest.fn() };
  const mockAiUsageLogService = { log: jest.fn(), findByUser: jest.fn(), getSummaryByUser: jest.fn() };
  const mockDataSource = { getRepository: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrdersService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: VisionService, useValue: mockVisionService },
        { provide: MappingCommitService, useValue: mockMappingCommitService },
        { provide: SalesOrderSpecsService, useValue: mockSalesOrderSpecsService },
        { provide: AiUsageLogService, useValue: mockAiUsageLogService },
      ],
    }).compile();
    service = module.get(SalesOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeImage - AI 사용량 과금 로그', () => {
    it('실제 Gemini 응답(pageCount > 0)이면 사용량을 로그로 남기고 과금액을 반환해야 한다', async () => {
      mockVisionService.analyzeSalesOrder.mockResolvedValue({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        usage: { pageCount: 6, promptTokens: 3699, outputTokens: 11765 },
        isMock: false,
      });
      mockAiUsageLogService.log.mockResolvedValue({ id: 1, chargedAmountKrw: 1000 });

      const result = await service.analyzeImage({} as any, 42);

      expect(mockAiUsageLogService.log).toHaveBeenCalledWith(42, 6, 3699, 11765);
      expect(result).toEqual({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        chargedAmountKrw: 1000,
        isMock: false,
      });
    });

    it('목업 응답(pageCount === 0)이면 과금 로그를 남기지 않고 과금액 0, isMock: true를 반환해야 한다(PR-096)', async () => {
      mockVisionService.analyzeSalesOrder.mockResolvedValue({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 },
        isMock: true,
      });

      const result = await service.analyzeImage({} as any, 42);

      expect(mockAiUsageLogService.log).not.toHaveBeenCalled();
      expect(result.chargedAmountKrw).toBe(0);
      expect(result.isMock).toBe(true);
    });
  });
});
