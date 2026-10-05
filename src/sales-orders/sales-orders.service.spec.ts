import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SalesOrdersService } from './sales-orders.service';
import { VisionService } from './vision.service';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { SalesOrderSpecsService } from './sales-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { Contract } from '../styles/entities/contract.entity';

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

  // PR-168: 미도 전용 수기 CMT단가 — 검토 화면에서 사람이 확인한 overview.cmtPrice만
  // mapping-commit으로 넘어가는지(handwrittenCmtPriceCandidate는 넘어가지 않음).
  describe('commitAnalysis - CMT단가 전달 (PR-168)', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMasterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'S1',
        overview: { totalQty: 100, targetRdd: null, factory: '베트남', buyer: '미도컴퍼니', productionType: 'CMT', cmtPrice: 7500, fobPrice: null, cmtPriceConfidence: undefined, cmtPriceNote: undefined },
      });
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    it('overview.cmtPrice(사람이 확인한 값)가 mapping-commit overviewData.cmtPrice로 그대로 전달된다', async () => {
      await service.commitAnalysis({
        overview: {
          styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남',
          buyer: '미도컴퍼니', totalQty: 100, targetRdd: null, documentDate: null,
          handwrittenCmtPriceCandidate: 7500, cmtPrice: 7500,
        },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockMappingCommitService.commit).toHaveBeenCalledWith(
        expect.objectContaining({ overviewData: expect.objectContaining({ cmtPrice: 7500 }) }),
      );
    });

    it('cmtPrice가 비어 있으면(사람이 아직 확인/저장하지 않음) undefined로 전달된다(저장되지 않음)', async () => {
      await service.commitAnalysis({
        overview: {
          styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남',
          buyer: '미도컴퍼니', totalQty: 100, targetRdd: null, documentDate: null,
          handwrittenCmtPriceCandidate: 7500, cmtPrice: null, // 후보는 있지만 아직 확인 안 함
        },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockMappingCommitService.commit).toHaveBeenCalledWith(
        expect.objectContaining({ overviewData: expect.objectContaining({ cmtPrice: undefined }) }),
      );
    });
  });

  // PR-181: 미도 수기 CMT단가 초안 → 계약(Contract)까지 전달되는 정확한 지점.
  // commitAnalysis()가 mappingCommitService.commit() 이후 StyleOverview를 다시 읽어, 이번
  // 요청의 cmtPrice가 실제로 그 값으로 반영됐을 때만(병합 충돌로 막히지 않았을 때만)
  // HANDWRITTEN_DRAFT로 표시하고 cmtPriceNote를 함께 저장한다.
  describe('commitAnalysis - 수기 CMT단가 초안 → Contract.cmtPriceConfidence/cmtPriceNote (PR-181)', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      jest.clearAllMocks();
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    const baseOverview = {
      styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남',
      buyer: '미도컴퍼니', totalQty: 100, targetRdd: null, documentDate: null,
    };

    it('병합이 막히지 않고(StyleOverview.cmtPrice === 보낸 값) 코멘트가 있으면 HANDWRITTEN_DRAFT로 생성된다', async () => {
      mockMasterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'S1',
        overview: { totalQty: 100, targetRdd: null, factory: '베트남', buyer: '미도컴퍼니', productionType: 'CMT', cmtPrice: 7500, fobPrice: null },
      });

      await service.commitAnalysis({
        overview: { ...baseOverview, handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: '7,270 + 230 = 7,500', cmtPrice: 7500, cmtPriceNote: '작지 수기: 7,270 + 230 = 7,500' },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cmtPrice: 7500, cmtPriceConfidence: 'HANDWRITTEN_DRAFT', cmtPriceNote: '작지 수기: 7,270 + 230 = 7,500' }),
      );
    });

    it('기존 CMT단가와 달라 병합이 막히면(StyleOverview.cmtPrice가 이번 요청 값과 다름) HANDWRITTEN_DRAFT로 표시하지 않는다', async () => {
      // mergeOverview가 CMT_PRICE_MISMATCH로 반영을 보류한 경우 — DB에는 기존(이번 요청과
      // 다른) 값이 그대로 남는다.
      mockMasterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'S1',
        overview: { totalQty: 100, targetRdd: null, factory: '베트남', buyer: '미도컴퍼니', productionType: 'CMT', cmtPrice: 7000, fobPrice: null },
      });

      await service.commitAnalysis({
        overview: { ...baseOverview, handwrittenCmtPriceCandidate: 7500, cmtPrice: 7500, cmtPriceNote: '작지 수기: 7,500' },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cmtPrice: 7000, cmtPriceConfidence: null, cmtPriceNote: null }),
      );
    });

    it('cmtPrice를 보내지 않으면(초안 없음) cmtPriceConfidence/cmtPriceNote는 null이다', async () => {
      mockMasterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'S1',
        overview: { totalQty: 100, targetRdd: null, factory: '베트남', buyer: '미도컴퍼니', productionType: 'CMT', cmtPrice: null, fobPrice: null },
      });

      await service.commitAnalysis({
        overview: { ...baseOverview, handwrittenCmtPriceCandidate: null, cmtPrice: null },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cmtPrice: null, cmtPriceConfidence: null, cmtPriceNote: null }),
      );
    });
  });
});
