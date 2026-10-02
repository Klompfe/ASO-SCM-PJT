import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContractsService } from './contracts.service';
import { Contract, ContractStatus } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';
import { ProductionType } from './entities/style-overview.entity';
import { SalesContractPricesService } from '../sales-contract-prices/sales-contract-prices.service';

// PR-090: bulkApprove()는 approve()를 건별로 그대로 재사용하므로, approve()가
// queryRunner 트랜잭션으로 "같은 styleNo의 기존 APPROVED를 SUPERSEDED로 내린다"는
// 불변식을 실제로 지키는지까지 함께 검증하려면 findOne/save가 실제로 상태를
// 주고받는 가짜 저장소가 필요하다 — 단순 jest.fn() 스텁만으로는 이 시나리오(같은
// styleNo 중복 승인)를 재현할 수 없다.
describe('ContractsService (PR-090 bulkApprove)', () => {
  let service: ContractsService;
  let contractRepository: Repository<Contract>;
  let testingModule: TestingModule;
  let store: Contract[];

  const makeContract = (overrides: Partial<Contract>): Contract =>
    ({
      id: 0,
      styleNo: 'STYLE-A',
      status: ContractStatus.PENDING_APPROVAL,
      notes: null,
      approvedByUserId: null,
      approvedAt: null,
      issuedAt: new Date(),
      ...overrides,
    }) as Contract;

  beforeEach(async () => {
    store = [];

    const queryRunnerFactory = () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn((_entity: any, opts: any) => {
          const where = opts.where;
          const found = store.find((c) => {
            if (where.id !== undefined && c.id !== where.id) return false;
            if (where.styleNo !== undefined && c.styleNo !== where.styleNo) return false;
            if (where.status !== undefined && c.status !== where.status) return false;
            return true;
          });
          return Promise.resolve(found ?? null);
        }),
        save: jest.fn((entity: Contract) => {
          const idx = store.findIndex((c) => c.id === entity.id);
          if (idx >= 0) store[idx] = entity;
          return Promise.resolve(entity);
        }),
      },
    });

    testingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        {
          provide: getRepositoryToken(Contract),
          useValue: {
            find: jest.fn(() => Promise.resolve(store.filter((c) => c.status === ContractStatus.PENDING_APPROVAL))),
            findOne: jest.fn(),
            create: jest.fn((data: any) => data),
            save: jest.fn((entity: any) => Promise.resolve(entity)),
          },
        },
        {
          provide: getRepositoryToken(MasterStyle),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn(queryRunnerFactory) },
        },
        {
          provide: SalesContractPricesService,
          useValue: { resolve: jest.fn() },
        },
      ],
    }).compile();

    service = testingModule.get(ContractsService);
    contractRepository = testingModule.get(getRepositoryToken(Contract));
  });

  it('여러 건을 ids로 지정하면 모두 승인되고 approvedCount가 정확해야 한다', async () => {
    store.push(makeContract({ id: 1, styleNo: 'STYLE-A' }));
    store.push(makeContract({ id: 2, styleNo: 'STYLE-B' }));
    store.push(makeContract({ id: 3, styleNo: 'STYLE-C' }));

    const result = await service.bulkApprove([1, 2, 3], 99);

    expect(result.approvedCount).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(store.every((c) => c.status === ContractStatus.APPROVED)).toBe(true);
    expect(store.every((c) => c.approvedByUserId === 99)).toBe(true);
  });

  it('ids를 지정하지 않으면 현재 PENDING_APPROVAL 전체를 대상으로 한다', async () => {
    store.push(makeContract({ id: 1, styleNo: 'STYLE-A' }));
    store.push(makeContract({ id: 2, styleNo: 'STYLE-B', status: ContractStatus.APPROVED }));
    store.push(makeContract({ id: 3, styleNo: 'STYLE-C' }));

    const result = await service.bulkApprove(undefined, 99);

    expect(result.approvedCount).toBe(2);
    expect(store.find((c) => c.id === 1)!.status).toBe(ContractStatus.APPROVED);
    expect(store.find((c) => c.id === 3)!.status).toBe(ContractStatus.APPROVED);
    // 이미 APPROVED였던 건은 대상이 아니었으므로 그대로다(승인 로직이 손대지 않음).
    expect(store.find((c) => c.id === 2)!.status).toBe(ContractStatus.APPROVED);
  });

  it('일부 건이 실패해도(이미 처리된 계약) 나머지는 계속 처리되고 failed에 사유가 담긴다', async () => {
    store.push(makeContract({ id: 1, styleNo: 'STYLE-A' }));
    store.push(makeContract({ id: 2, styleNo: 'STYLE-B', status: ContractStatus.REJECTED }));
    store.push(makeContract({ id: 3, styleNo: 'STYLE-C' }));

    const result = await service.bulkApprove([1, 2, 3, 999], 99);

    expect(result.approvedCount).toBe(2);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.find((f) => f.id === 2)?.reason).toContain('이미 처리된 계약');
    expect(result.failed.find((f) => f.id === 999)?.reason).toContain('찾을 수 없습니다');
    expect(store.find((c) => c.id === 1)!.status).toBe(ContractStatus.APPROVED);
    expect(store.find((c) => c.id === 3)!.status).toBe(ContractStatus.APPROVED);
  });

  it('같은 styleNo의 계약 두 건을 함께 일괄승인하면, 먼저 처리된 건이 나중 건에 의해 SUPERSEDED로 내려간다', async () => {
    store.push(makeContract({ id: 1, styleNo: 'STYLE-A' }));
    store.push(makeContract({ id: 2, styleNo: 'STYLE-A' }));

    const result = await service.bulkApprove([1, 2], 99);

    expect(result.approvedCount).toBe(2);
    expect(result.failed).toHaveLength(0);
    // 순차 처리이므로 먼저 승인된 id=1이 id=2 승인 시점에 SUPERSEDED로 내려가고,
    // 최종적으로 활성 계약은 id=2 하나만 APPROVED여야 한다.
    expect(store.find((c) => c.id === 1)!.status).toBe(ContractStatus.SUPERSEDED);
    expect(store.find((c) => c.id === 2)!.status).toBe(ContractStatus.APPROVED);
  });

  it('단건 approve()는 기존과 동일하게 PENDING_APPROVAL이 아니면 BadRequestException을 던진다', async () => {
    store.push(makeContract({ id: 1, styleNo: 'STYLE-A', status: ContractStatus.REJECTED }));

    await expect(service.approve(1, 99)).rejects.toThrow(BadRequestException);
  });

  it('단건 approve()는 존재하지 않는 id면 NotFoundException을 던진다', async () => {
    await expect(service.approve(9999, 99)).rejects.toThrow(NotFoundException);
  });

  // PR-166: 수동 발행(issue())도 수주 등록(AI 분석) 경로처럼 StyleOverview 스냅샷을
  // 복사하고, CMT 계약인데 단가가 비어 있으면 CMT매입단가 표준가격을 조회해 채운다.
  describe('issue — StyleOverview 스냅샷 + CMT매입단가 자동 조회 (PR-166)', () => {
    let masterStyleRepo: { findOne: jest.Mock };
    let salesContractPricesService: { resolve: jest.Mock };

    beforeEach(() => {
      masterStyleRepo = testingModule.get(getRepositoryToken(MasterStyle));
      salesContractPricesService = testingModule.get(SalesContractPricesService);
    });

    it('존재하지 않는 스타일이면 NotFoundException', async () => {
      masterStyleRepo.findOne.mockResolvedValue(null);
      await expect(service.issue({ styleNo: 'NOPE' } as any)).rejects.toThrow(NotFoundException);
    });

    it('FOB 계약이면 CMT 단가 조회를 아예 하지 않고 overview 값을 그대로 스냅샷한다', async () => {
      masterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'ST1',
        overview: {
          totalQty: 500, targetRdd: '2026-12-01', factory: '베트남', buyer: '미도컴퍼니',
          productionType: ProductionType.FOB, cmtPrice: null, fobPrice: 12.5, itemType: "WOMEN'S PANTS",
        },
      });

      const result = await service.issue({ styleNo: 'ST1' } as any);

      expect(salesContractPricesService.resolve).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        totalQty: 500, factory: '베트남', buyer: '미도컴퍼니',
        productionType: ProductionType.FOB, fobPrice: 12.5, cmtPrice: null,
        cmtPriceConfidence: null, cmtPriceNote: null,
      });
    });

    it('CMT 계약이고 cmtPrice가 비어 있으면 표준가격을 조회해 정확매칭이면 자동으로 채운다', async () => {
      masterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'ST2',
        overview: { totalQty: 300, factory: '베트남', buyer: '미도컴퍼니', productionType: ProductionType.CMT, cmtPrice: null, itemType: "WOMEN'S COAT" },
      });
      salesContractPricesService.resolve.mockResolvedValue({
        confidence: 'EXACT_STYLE_MATCH', price: 10, priceMin: 10, priceMax: 10, matchedCount: 1,
        note: 'SALES CONTRACT에 스타일번호가 그대로 있음(단가 $10)', brand: '루미에반', category: "WOMEN'S COAT",
      });

      const result = await service.issue({ styleNo: 'ST2' } as any);

      expect(salesContractPricesService.resolve).toHaveBeenCalledWith('ST2', "WOMEN'S COAT");
      expect(result.cmtPrice).toBe(10);
      expect(result.cmtPriceConfidence).toBe('EXACT_STYLE_MATCH');
    });

    it('CMT 계약인데 표준가격도 못 찾으면(NEEDS_REVIEW) cmtPrice는 null로 남기고 근거만 기록한다(승인 자체는 막지 않음)', async () => {
      masterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'ST3',
        overview: { totalQty: 300, factory: '베트남', buyer: '미도컴퍼니', productionType: ProductionType.CMT, cmtPrice: null, itemType: "WOMEN'S PANTS" },
      });
      salesContractPricesService.resolve.mockResolvedValue({
        confidence: 'NEEDS_REVIEW', price: null, priceMin: 4.5, priceMax: 8.5, matchedCount: 17,
        note: '빈폴×WOMEN\'S PANTS 단가 편차가 커서 평균을 표준가격으로 쓰기 어려움 — 수동 확인 필요', brand: '빈폴', category: "WOMEN'S PANTS",
      });

      const result = await service.issue({ styleNo: 'ST3' } as any);

      expect(result.cmtPrice).toBeNull();
      expect(result.cmtPriceConfidence).toBe('NEEDS_REVIEW');
      expect(result.cmtPriceNote).toContain('수동 확인 필요');
    });

    it('CMT 계약이어도 cmtPrice가 이미 있으면(기존 StyleOverview 값) 표준가격을 조회하지 않는다', async () => {
      masterStyleRepo.findOne.mockResolvedValue({
        styleNo: 'ST4',
        overview: { totalQty: 300, factory: '베트남', buyer: '미도컴퍼니', productionType: ProductionType.CMT, cmtPrice: 9.99, itemType: "WOMEN'S COAT" },
      });

      const result = await service.issue({ styleNo: 'ST4' } as any);

      expect(salesContractPricesService.resolve).not.toHaveBeenCalled();
      expect(result.cmtPrice).toBe(9.99);
      expect(result.cmtPriceConfidence).toBeNull();
    });
  });
});
