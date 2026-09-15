import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContractsService } from './contracts.service';
import { Contract, ContractStatus } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';

// PR-090: bulkApprove()는 approve()를 건별로 그대로 재사용하므로, approve()가
// queryRunner 트랜잭션으로 "같은 styleNo의 기존 APPROVED를 SUPERSEDED로 내린다"는
// 불변식을 실제로 지키는지까지 함께 검증하려면 findOne/save가 실제로 상태를
// 주고받는 가짜 저장소가 필요하다 — 단순 jest.fn() 스텁만으로는 이 시나리오(같은
// styleNo 중복 승인)를 재현할 수 없다.
describe('ContractsService (PR-090 bulkApprove)', () => {
  let service: ContractsService;
  let contractRepository: Repository<Contract>;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        {
          provide: getRepositoryToken(Contract),
          useValue: {
            find: jest.fn(() => Promise.resolve(store.filter((c) => c.status === ContractStatus.PENDING_APPROVAL))),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MasterStyle),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn(queryRunnerFactory) },
        },
      ],
    }).compile();

    service = module.get(ContractsService);
    contractRepository = module.get(getRepositoryToken(Contract));
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
});
