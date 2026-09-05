import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrderStatus } from './entities/work-order-status.enum';
import { VisionService } from './vision.service';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { MappingCommitService } from '../mapping/services/mapping-commit.service';
import { WorkOrderSpecsService } from './work-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let woRepository: Repository<WorkOrder>;
  let dataSource: DataSource;

  const mockWoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockItemRepository = {
    findOne: jest.fn(),
  };

  const mockQueryRunnerManager = {
    findOne: jest.fn(),
    save: jest.fn((_entity, data) => Promise.resolve(data)),
    create: jest.fn((_entity, data) => data),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockQueryRunnerManager,
  };

  const mockDataSource = {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Item) return mockItemRepository;
      return mockWoRepository;
    }),
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  const mockVisionService = {
    analyzeWorkOrder: jest.fn(),
  };

  const mockMappingCommitService = {
    commit: jest.fn(),
  };

  const mockWorkOrderSpecsService = {
    save: jest.fn(),
    findByStyleNo: jest.fn(),
  };

  const mockAiUsageLogService = {
    log: jest.fn(),
    findByUser: jest.fn(),
    getSummaryByUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.getRepository.mockImplementation((entity: any) => {
      if (entity === Item) return mockItemRepository;
      return mockWoRepository;
    });
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunnerManager.save.mockImplementation((_entity: any, data: any) => Promise.resolve(data));
    mockQueryRunnerManager.create.mockImplementation((_entity: any, data: any) => data);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: mockWoRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: VisionService,
          useValue: mockVisionService,
        },
        {
          provide: MappingCommitService,
          useValue: mockMappingCommitService,
        },
        {
          provide: WorkOrderSpecsService,
          useValue: mockWorkOrderSpecsService,
        },
        {
          provide: AiUsageLogService,
          useValue: mockAiUsageLogService,
        },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
    woRepository = module.get<Repository<WorkOrder>>(getRepositoryToken(WorkOrder));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('완제품 및 BOM이 존재하는 경우 작업지시를 정상 생성해야 한다', async () => {
      const dto = { itemId: 1, targetQuantity: 10 };
      const mockItem = { id: 1, name: '완제품 A' };
      const expectedWo = { id: 1, ...dto, item: mockItem, status: WorkOrderStatus.PENDING };

      mockItemRepository.findOne.mockResolvedValue(mockItem);
      mockWoRepository.create.mockReturnValue(expectedWo);
      mockWoRepository.save.mockResolvedValue(expectedWo);

      const result = await service.create(dto as any);
      expect(result).toEqual(expectedWo);
    });
  });

  describe('updateStatus', () => {
    it('COMPLETED 상태 변경 시 완제품 증대 및 원자재 차감이 정상 동작해야 한다', async () => {
      const mockWo = { id: 1, targetQuantity: 10, status: WorkOrderStatus.IN_PROGRESS };
      const updatedWo = { ...mockWo, status: WorkOrderStatus.COMPLETED };

      mockWoRepository.findOne.mockResolvedValue(mockWo);
      mockWoRepository.save.mockResolvedValue(updatedWo);

      const result = await service.updateStatus(1, WorkOrderStatus.COMPLETED);
      expect(result.status).toEqual(WorkOrderStatus.COMPLETED);
    });

    it('재고가 충분하면 원자재를 정확히 차감하고 완제품 재고를 정확히 증가시켜야 한다', async () => {
      const wo = {
        id: 1,
        targetQuantity: 10,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 100, name: '완제품', styleNo: 'STY-01' },
      };
      const style = { styleNo: 'STY-01' };
      const rawMaterial = { id: 200, name: '원자재A' };
      const bom = { id: 5, items: [{ material: rawMaterial, consumption: 2 }] };

      mockWoRepository.findOne.mockResolvedValue(wo);
      mockQueryRunnerManager.findOne.mockImplementation((entity: any, options: any) => {
        if (entity === MasterStyle) return Promise.resolve(style);
        if (entity === Bom) return Promise.resolve(bom);
        if (entity === Inventory) {
          if (options.where.itemId === 200) return Promise.resolve({ id: 1, itemId: 200, quantity: 100 });
          if (options.where.itemId === 100) return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await service.updateStatus(1, WorkOrderStatus.COMPLETED);

      expect(result.status).toBe(WorkOrderStatus.COMPLETED);

      const inventorySaves = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === Inventory);
      const rawSave = inventorySaves.find(([, data]: any) => data.itemId === 200);
      const finishedSave = inventorySaves.find(([, data]: any) => data.itemId === 100);

      expect(rawSave[1].quantity).toBe(80); // 100 - (소요량 2 * 목표수량 10)
      expect(finishedSave[1].quantity).toBe(10); // 신규 생성(0) + 목표수량 10

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('원자재 재고가 부족하면 BadRequestException을 던지고 롤백하여 재고를 변경하지 않아야 한다', async () => {
      const wo = {
        id: 2,
        targetQuantity: 1000,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 100, name: '완제품', styleNo: 'STY-01' },
      };
      const style = { styleNo: 'STY-01' };
      const rawMaterial = { id: 200, name: '원자재A' };
      const bom = { id: 5, items: [{ material: rawMaterial, consumption: 2 }] };

      mockWoRepository.findOne.mockResolvedValue(wo);
      mockQueryRunnerManager.findOne.mockImplementation((entity: any, options: any) => {
        if (entity === MasterStyle) return Promise.resolve(style);
        if (entity === Bom) return Promise.resolve(bom);
        if (entity === Inventory && options.where.itemId === 200) {
          return Promise.resolve({ id: 1, itemId: 200, quantity: 80 }); // 필요량 2000 > 보유 80
        }
        return Promise.resolve(null);
      });

      await expect(service.updateStatus(2, WorkOrderStatus.COMPLETED)).rejects.toBeInstanceOf(BadRequestException);

      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('styleNo가 없거나 해당 style의 Bom을 찾을 수 없으면 에러 없이 status만 COMPLETED로 바뀌고 재고 로직은 실행되지 않아야 한다', async () => {
      // (1) FINISHED_GOOD Item에 styleNo 자체가 설정되지 않은 경우
      const woNoStyleNo = {
        id: 3,
        targetQuantity: 5,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 300, name: '완제품(styleNo 없음)' },
      };
      mockWoRepository.findOne.mockResolvedValueOnce(woNoStyleNo);

      const result1 = await service.updateStatus(3, WorkOrderStatus.COMPLETED);

      expect(result1.status).toBe(WorkOrderStatus.COMPLETED);
      expect(mockQueryRunnerManager.findOne).not.toHaveBeenCalled(); // MasterStyle 조회 자체를 시도하지 않음
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);

      // (2) styleNo는 있지만 그 style에 등록된 Bom이 없는 경우
      const woNoBom = {
        id: 4,
        targetQuantity: 5,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 301, name: '완제품(Bom 없음)', styleNo: 'STY-NO-BOM' },
      };
      mockWoRepository.findOne.mockResolvedValueOnce(woNoBom);
      mockQueryRunnerManager.findOne.mockReset();
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === MasterStyle) return Promise.resolve({ styleNo: 'STY-NO-BOM' });
        if (entity === Bom) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result2 = await service.updateStatus(4, WorkOrderStatus.COMPLETED);

      expect(result2.status).toBe(WorkOrderStatus.COMPLETED);
      expect(mockQueryRunnerManager.findOne.mock.calls.some(([entity]: any) => entity === Inventory)).toBe(false);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalledWith(Inventory, expect.anything());
    });

    it('COMPLETED가 아닌 다른 상태로 변경할 때는 재고 로직(QueryRunner 트랜잭션)이 전혀 실행되지 않아야 한다', async () => {
      const wo = {
        id: 5,
        targetQuantity: 10,
        status: WorkOrderStatus.PENDING,
        item: { id: 100, name: '완제품', styleNo: 'STY-01' },
      };
      const updatedWo = { ...wo, status: WorkOrderStatus.IN_PROGRESS };

      mockWoRepository.findOne.mockResolvedValue(wo);
      mockWoRepository.save.mockResolvedValue(updatedWo);

      const result = await service.updateStatus(5, WorkOrderStatus.IN_PROGRESS);

      expect(result.status).toBe(WorkOrderStatus.IN_PROGRESS);
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(mockQueryRunnerManager.findOne).not.toHaveBeenCalled();
      expect(mockWoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WorkOrderStatus.IN_PROGRESS }),
      );
    });
  });

  // 임시 스크립트(verify-completion-flow.ts)로 실제 sqlite DB에 대해 검증했던 시나리오를
  // 영구 mock 기반 유닛 테스트로 이관한다. 스크립트 자체는 검증 후 삭제되었다.
  describe('updateStatus - BOM 기반 재고 차감 시나리오 (실제 검증 스크립트 이관)', () => {
    // TypeORM의 `findOne(Bom, { order: { id: 'DESC' } })`을 실제 쿼리처럼 흉내낸다.
    // order 옵션을 무시하거나 잘못 바꾸면 삽입 순서(오래된 Bom)가 그대로 반환되어
    // 아래 시나리오 A가 실패하도록 만들어, "최신 Bom 사용" 회귀를 테스트가 잡아낼 수 있게 한다.
    function fakeBomFindOne(boms: any[], options: any) {
      const sorted = [...boms].sort((a, b) => {
        if (options?.order?.id === 'DESC') return b.id - a.id;
        if (options?.order?.id === 'ASC') return a.id - b.id;
        return 0; // order 미지정 시 삽입 순서(가장 오래된 것이 먼저) 그대로 반환
      });
      return Promise.resolve(sorted[0] ?? null);
    }

    it('시나리오 A: 재고가 충분하면 정확히 차감하고, 같은 style에 Bom이 여러 개 있어도 최신(id DESC) 것을 사용해야 한다', async () => {
      const wo = {
        id: 10,
        targetQuantity: 10,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 100, name: '완제품', styleNo: 'STY-VERIFY-001' },
      };
      const style = { styleNo: 'STY-VERIFY-001' };
      const rawMaterial = { id: 200, name: '검증용 원단' };

      // 구버전 Bom은 일부러 비현실적인 소요량(999)을 넣어, 서비스가 실수로 이걸 골랐다면
      // 반드시 재고부족(BadRequestException)으로 시나리오가 실패하도록 만든다.
      const bomOld = { id: 5, bomNo: 'BOM-OLD', items: [{ material: rawMaterial, consumption: 999 }] };
      const bomNew = { id: 6, bomNo: 'BOM-NEW', items: [{ material: rawMaterial, consumption: 2 }] };

      mockWoRepository.findOne.mockResolvedValue(wo);
      mockQueryRunnerManager.findOne.mockImplementation((entity: any, options: any) => {
        if (entity === MasterStyle) return Promise.resolve(style);
        if (entity === Bom) return fakeBomFindOne([bomOld, bomNew], options);
        if (entity === Inventory) {
          if (options.where.itemId === 200) return Promise.resolve({ id: 1, itemId: 200, quantity: 100 });
          if (options.where.itemId === 100) return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const result = await service.updateStatus(10, WorkOrderStatus.COMPLETED);

      expect(result.status).toBe(WorkOrderStatus.COMPLETED);

      const inventorySaves = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === Inventory);
      const rawSave = inventorySaves.find(([, data]: any) => data.itemId === 200);
      const finishedSave = inventorySaves.find(([, data]: any) => data.itemId === 100);

      expect(rawSave[1].quantity).toBe(80); // 100 - (최신 Bom 소요량 2 * 목표수량 10) = 80
      expect(finishedSave[1].quantity).toBe(10);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('시나리오 B: 재고가 부족하면 BadRequestException을 던지고 롤백하여 재고가 변하지 않아야 한다', async () => {
      const wo = {
        id: 11,
        targetQuantity: 1000,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 100, name: '완제품', styleNo: 'STY-VERIFY-001' },
      };
      const style = { styleNo: 'STY-VERIFY-001' };
      const rawMaterial = { id: 200, name: '검증용 원단' };
      const bomNew = { id: 6, bomNo: 'BOM-NEW', items: [{ material: rawMaterial, consumption: 2 }] };

      mockWoRepository.findOne.mockResolvedValue(wo);
      mockQueryRunnerManager.findOne.mockImplementation((entity: any, options: any) => {
        if (entity === MasterStyle) return Promise.resolve(style);
        if (entity === Bom) return fakeBomFindOne([bomNew], options);
        if (entity === Inventory && options.where.itemId === 200) {
          return Promise.resolve({ id: 1, itemId: 200, quantity: 80 }); // 필요량 2*1000=2000 > 보유 80
        }
        return Promise.resolve(null);
      });

      await expect(service.updateStatus(11, WorkOrderStatus.COMPLETED)).rejects.toBeInstanceOf(BadRequestException);

      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled(); // 재고 저장 자체가 없어야 함(불변)
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('시나리오 C: styleNo가 없으면 에러 없이 status만 COMPLETED로 바뀌고 재고 로직은 실행되지 않아야 한다', async () => {
      const wo = {
        id: 12,
        targetQuantity: 5,
        status: WorkOrderStatus.IN_PROGRESS,
        item: { id: 300, name: '검증용 완제품(styleNo 없음)' },
      };

      mockWoRepository.findOne.mockResolvedValue(wo);

      const result = await service.updateStatus(12, WorkOrderStatus.COMPLETED);

      expect(result.status).toBe(WorkOrderStatus.COMPLETED);
      expect(mockQueryRunnerManager.findOne).not.toHaveBeenCalled(); // MasterStyle 조회 자체를 시도하지 않음
      expect(mockQueryRunnerManager.save.mock.calls.some(([entity]: any) => entity === Inventory)).toBe(false);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('analyzeWorkOrderImage - AI 사용량 과금 로그', () => {
    it('실제 Gemini 응답(pageCount > 0)이면 사용량을 로그로 남기고 과금액을 반환해야 한다', async () => {
      mockVisionService.analyzeWorkOrder.mockResolvedValue({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        usage: { pageCount: 6, promptTokens: 3699, outputTokens: 11765 },
      });
      mockAiUsageLogService.log.mockResolvedValue({ id: 1, chargedAmountKrw: 1000 });

      const result = await service.analyzeWorkOrderImage({} as any, 42);

      expect(mockAiUsageLogService.log).toHaveBeenCalledWith(42, 6, 3699, 11765);
      expect(result).toEqual({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        chargedAmountKrw: 1000,
      });
    });

    it('목업 응답(pageCount === 0)이면 과금 로그를 남기지 않고 과금액 0을 반환해야 한다', async () => {
      mockVisionService.analyzeWorkOrder.mockResolvedValue({
        results: [{ overview: {}, bomItems: [], sizeSpecs: [], workNotes: null }],
        usage: { pageCount: 0, promptTokens: 0, outputTokens: 0 },
      });

      const result = await service.analyzeWorkOrderImage({} as any, 42);

      expect(mockAiUsageLogService.log).not.toHaveBeenCalled();
      expect(result.chargedAmountKrw).toBe(0);
    });
  });
});