import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderProgressSummaryService } from './order-progress-summary.service';
import { MasterStyle } from './entities/master-style.entity';
import { Contract } from './entities/contract.entity';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { OrderShipment } from './entities/order-shipment.entity';

// PR-167: 생산처(factory) 필터 — 기존 getSummary() 계산 로직 자체는 이번 PR에서
// 건드리지 않았으므로(기존에도 유닛 테스트가 없었음) 새로 추가한 필터 동작만 좁게 검증한다.
describe('OrderProgressSummaryService — factory 필터 (PR-167)', () => {
  let service: OrderProgressSummaryService;
  const mockMasterStyleRepo = { find: jest.fn() };
  const mockContractRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockStageRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockShipmentRepo = { find: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockContractRepo.find.mockResolvedValue([]);
    mockStageRepo.find.mockResolvedValue([]);
    mockShipmentRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderProgressSummaryService,
        { provide: getRepositoryToken(MasterStyle), useValue: mockMasterStyleRepo },
        { provide: getRepositoryToken(Contract), useValue: mockContractRepo },
        { provide: getRepositoryToken(OrderProcessStage), useValue: mockStageRepo },
        { provide: getRepositoryToken(OrderShipment), useValue: mockShipmentRepo },
      ],
    }).compile();

    service = module.get(OrderProgressSummaryService);
  });

  it('factory를 생략하면 모든 스타일을 그대로 보여준다(완전히 숨기지 않음, 기존 동작 유지)', async () => {
    mockMasterStyleRepo.find.mockResolvedValue([
      { styleNo: 'A1', overview: { factory: '태일', totalQty: 100, targetRdd: null } },
      { styleNo: 'A2', overview: { factory: '재원', totalQty: 100, targetRdd: null } },
    ]);

    const rows = await service.getSummary();
    expect(rows.map((r) => r.styleNo).sort()).toEqual(['A1', 'A2']);
  });

  it('factory를 지정하면 그 생산처 스타일만 돌려준다', async () => {
    mockMasterStyleRepo.find.mockResolvedValue([
      { styleNo: 'A1', overview: { factory: '태일', totalQty: 100, targetRdd: null } },
      { styleNo: 'A2', overview: { factory: '재원', totalQty: 100, targetRdd: null } },
      { styleNo: 'A3', overview: { factory: '태일', totalQty: 100, targetRdd: null } },
    ]);

    const rows = await service.getSummary('태일');
    expect(rows.map((r) => r.styleNo).sort()).toEqual(['A1', 'A3']);
  });

  it('overview가 없는(공장 정보 미상) 스타일은 특정 factory로 필터링할 때 빠진다', async () => {
    mockMasterStyleRepo.find.mockResolvedValue([
      { styleNo: 'A1', overview: { factory: '태일', totalQty: 100, targetRdd: null } },
      { styleNo: 'A4', overview: null },
    ]);

    const rows = await service.getSummary('태일');
    expect(rows.map((r) => r.styleNo)).toEqual(['A1']);
  });
});
