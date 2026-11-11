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
  const mockMappingCommitService = { commit: jest.fn(), compareSalesOrderBom: jest.fn() };
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

  // PR-235(PILOT-23 후속): 저장 전 비교 — commitAnalysis와 같은 bomItems 필드 매핑으로
  // MappingCommitService.compareSalesOrderBom에 그대로 넘긴다(읽기 전용, DB 쓰기 없음).
  describe('compareBom (PR-235)', () => {
    it('styleNo와 bomItems(itemName/englishName/category/colorCode/spec/consumption/requiredQty)를 그대로 전달한다', async () => {
      mockMappingCommitService.compareSalesOrderBom.mockResolvedValue({ hasExistingBom: false, rows: [] });

      await service.compareBom({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '다데테이프(면)', spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null, englishName: 'EDGE TAPE' }],
        sizeSpecs: [], workNotes: null,
      } as any);

      expect(mockMappingCommitService.compareSalesOrderBom).toHaveBeenCalledWith({
        styleNo: 'S1',
        bomItems: [{ itemName: '다데테이프(면)', englishName: 'EDGE TAPE', category: '부자재', colorCode: undefined, spec: undefined, consumption: 1, requiredQty: 100 }],
      });
    });

    it('styleNo가 없으면 400을 던지고 compareSalesOrderBom을 호출하지 않는다', async () => {
      await expect(
        service.compareBom({
          overview: { styleNo: null, styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null },
          bomItems: [], sizeSpecs: [], workNotes: null,
        } as any),
      ).rejects.toThrow();
      expect(mockMappingCommitService.compareSalesOrderBom).not.toHaveBeenCalled();
    });

    it('결과를 그대로 반환한다(가공하지 않음)', async () => {
      const compareResult = { hasExistingBom: true, rows: [{ type: 'same' }] };
      mockMappingCommitService.compareSalesOrderBom.mockResolvedValue(compareResult);

      const result = await service.compareBom({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null },
        bomItems: [], sizeSpecs: [], workNotes: null,
      } as any);

      expect(result).toBe(compareResult);
    });
  });

  // PR-200: VisionService는 DB에 접근하지 않으므로 SalesOrdersService가 자재/공급업체/
  // 스타일번호 목록을 모아 context로 넘긴다. DB 조회가 실패해도(예: 레포지토리 미구성)
  // 분석 자체는 계속돼야 한다(안전장치가 없어도 기존 분석 동작은 유지).
  describe('analyzeImage - PR-200 안전장치 컨텍스트', () => {
    it('Item/Supplier/MasterStyle 이름 목록을 모아 VisionService에 context로 넘긴다', async () => {
      const repos: Record<string, { find: jest.Mock }> = {
        items: { find: jest.fn().mockResolvedValue([{ name: '코아사' }]) },
        suppliers: { find: jest.fn().mockResolvedValue([{ name: '르카이' }]) },
        styles: { find: jest.fn().mockResolvedValue([{ styleNo: 'MB00AAA000Z' }]) },
      };
      mockDataSource.getRepository.mockImplementation((entity: any) => {
        if (entity.name === 'Item') return repos.items;
        if (entity.name === 'Supplier') return repos.suppliers;
        return repos.styles;
      });
      mockVisionService.analyzeSalesOrder.mockResolvedValue({
        results: [], usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 }, isMock: true, modelUsed: null, fallbackUsed: false,
      });

      await service.analyzeImage({} as any, 1);

      expect(mockVisionService.analyzeSalesOrder).toHaveBeenCalledWith({}, {
        masterItemNames: ['코아사'], supplierNames: ['르카이'], knownStyleNos: ['MB00AAA000Z'],
      });
    });

    it('DB 조회가 실패해도(레포지토리 없음) 분석은 빈 컨텍스트로 계속된다', async () => {
      mockDataSource.getRepository.mockReturnValue(undefined); // find 호출 시 TypeError 발생 상황 재현
      mockVisionService.analyzeSalesOrder.mockResolvedValue({
        results: [], usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 }, isMock: true, modelUsed: null, fallbackUsed: false,
      });

      await expect(service.analyzeImage({} as any, 1)).resolves.toBeDefined();
      expect(mockVisionService.analyzeSalesOrder).toHaveBeenCalledWith({}, {});
    });
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
  // PR-200: commitAnalysis는 bomItems.map()에서 필드를 하나씩 직접 골라 넘긴다 — AI
  // 후보/서버 경고 필드(itemNameCandidates, consumptionCandidates, uncertain,
  // uncertainReason, supplierName, rawItemName, warnings)는 그 목록에 없으므로 저장
  // 경로로 넘어가지 않는다. 회귀 방지용으로 명시적으로 확인한다.
  describe('commitAnalysis - PR-200 후보/경고 필드가 저장 경로로 안 넘어가는지', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMasterStyleRepo.findOne.mockResolvedValue({ styleNo: 'S1', overview: { totalQty: 100 } });
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    it('itemNameCandidates/consumptionCandidates/uncertain/supplierName/rawItemName/warnings는 commit payload에 없다', async () => {
      await service.commitAnalysis({
        overview: {
          styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남',
          buyer: null, totalQty: 100, targetRdd: null, documentDate: null,
          rawStyleNo: 's1', warnings: [{ code: 'STYLE_NO_CASE_NORMALIZED', message: 'x' }],
        },
        bomItems: [{
          category: '겉감', itemName: 'KL-R114', spec: null, colorCode: null, consumption: 1.2, requiredQty: null, supplier: null, remarks: null,
          itemNameCandidates: ['KL-R114', 'KL-R115'], consumptionCandidates: [1.2, 1.3], uncertain: true, uncertainReason: '손글씨 흐림',
          supplierName: '르카이', rawItemName: '르카이)KL-R114', warnings: [{ code: 'UNKNOWN_NAME', message: 'x' }],
        }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.overviewData.rawStyleNo).toBeUndefined();
      expect(payload.overviewData.warnings).toBeUndefined();
      const bomItem = payload.bomItems[0];
      expect(bomItem).toEqual({
        category: '겉감', itemName: 'KL-R114', spec: undefined, colorCode: undefined, consumption: 1.2,
        requiredQty: undefined, supplier: undefined, remarks: undefined, threadType: undefined, tapeType: undefined,
        // PR-220: requiredQty가 null(읽지 못함)이면 sheetQty도 undefined로 넘어간다.
        sheetQty: undefined, sheetQtyUnit: undefined,
      });
    });
  });

  // PR-220: commitAnalysis가 AI의 requiredQty(출고량, 기존 필드)/requiredQtyUnit(새 필드)을
  // BomItem.sheetQty/sheetQtyUnit으로도 함께 넘기는지 — 기존 requiredQty 전달(legacy 컬럼)은
  // 그대로 유지된 채(위 테스트에서 확인) 추가로만 넘어가야 한다.
  describe('commitAnalysis - sheetQty/sheetQtyUnit 전달 (PR-220)', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMasterStyleRepo.findOne.mockResolvedValue({ styleNo: 'S1', overview: { totalQty: 1518 } });
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    it('requiredQty/requiredQtyUnit이 있으면 sheetQty/sheetQtyUnit으로 그대로 넘어간다', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 1518, targetRdd: null, documentDate: null },
        bomItems: [{ category: '겉감', itemName: 'KHAKI KH', spec: null, colorCode: 'KH', consumption: 1, requiredQty: 758, requiredQtyUnit: 'Y', supplier: null, remarks: null }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.bomItems[0]).toMatchObject({ requiredQty: 758, sheetQty: 758, sheetQtyUnit: 'Y' });
    });

    it('requiredQtyUnit이 없으면(단위를 못 읽음) sheetQtyUnit은 undefined다(sheetQty는 그대로 넘어간다)', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 1518, targetRdd: null, documentDate: null },
        bomItems: [{ category: '겉감', itemName: 'KHAKI KH', spec: null, colorCode: 'KH', consumption: 1, requiredQty: 758, supplier: null, remarks: null }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.bomItems[0].sheetQty).toBe(758);
      expect(payload.bomItems[0].sheetQtyUnit).toBeUndefined();
    });
  });

  // PR-235(PILOT-23 후속): 저장 전 비교 화면의 선택(decisions)이 commit() 요청까지
  // 그대로 전달되는지 — 없으면 undefined로 넘어가 commit()의 기존 동작과 같다.
  describe('commitAnalysis - decisions 전달 (PR-235)', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMasterStyleRepo.findOne.mockResolvedValue({ styleNo: 'S1', overview: { totalQty: 100 } });
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    it('decisions을 보내면 commit() 요청에 그대로 전달된다', async () => {
      const decisions = { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 501 }], existing: [{ bomItemId: 502, action: 'delete' }] };
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '자재A', spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
        sizeSpecs: [], workNotes: null,
        decisions,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.decisions).toEqual(decisions);
    });

    it('decisions을 보내지 않으면 commit() 요청에도 undefined로 전달된다(기존 동작과 동일)', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '자재A', spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.decisions).toBeUndefined();
    });
  });

  // PR-234(사용자 확인 사례): 자재명에서 분리된 영문 표기/사용 위치가 commit payload에
  // 올바른 필드로 전달되는지 — 위치는 별도 컬럼이 없어 remarks에 합쳐진다.
  describe('commitAnalysis - 영문 표기/사용 위치 전달 (PR-234)', () => {
    const mockMasterStyleRepo = { findOne: jest.fn() };
    const mockContractRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };

    beforeEach(() => {
      mockDataSource.getRepository.mockImplementation((entity: any) =>
        entity === Contract ? mockContractRepo : mockMasterStyleRepo,
      );
      mockMasterStyleRepo.findOne.mockResolvedValue({ styleNo: 'S1', overview: { totalQty: 100 } });
      mockMappingCommitService.commit.mockResolvedValue({ success: true, notices: [], warnings: [] });
      mockSalesOrderSpecsService.save.mockResolvedValue({ id: 1 });
    });

    it('englishName은 그대로 전달되고, location은 remarks가 없으면 "위치: ..."로 채워진다', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '다데테이프(면)', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null, englishName: 'EDGE TAPE', location: '오비.주머니입구' }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.bomItems[0].englishName).toBe('EDGE TAPE');
      expect(payload.bomItems[0].remarks).toBe('위치: 오비.주머니입구');
    });

    it('기존 remarks가 있으면 지우지 않고 위치를 뒤에 덧붙인다', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '다데테이프(면)', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: '수입산', englishName: null, location: '오비.주머니입구' }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.bomItems[0].remarks).toBe('수입산 / 위치: 오비.주머니입구');
    });

    it('location이 없으면 remarks를 그대로 둔다(값을 지어내지 않음)', async () => {
      await service.commitAnalysis({
        overview: { styleNo: 'S1', styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null },
        bomItems: [{ category: '부자재', itemName: '다데테이프(면)', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: '수입산', englishName: null, location: null }],
        sizeSpecs: [], workNotes: null,
      } as any);

      const payload = mockMappingCommitService.commit.mock.calls[0][0];
      expect(payload.bomItems[0].remarks).toBe('수입산');
    });
  });

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
