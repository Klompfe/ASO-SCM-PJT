import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVouchersService } from './cash-vouchers.service';
import { CashVoucher, CashVoucherType } from './entities/cash-voucher.entity';

describe('CashVouchersService.getSummary (PR-094)', () => {
  let service: CashVouchersService;
  let repo: Repository<CashVoucher>;

  const makeVoucher = (overrides: Partial<CashVoucher>): CashVoucher =>
    ({
      id: 0,
      voucherType: CashVoucherType.DEPOSIT,
      voucherDate: new Date('2026-09-15'),
      amount: 0,
      counterpartyName: '테스트거래처',
      counterpartyBuyerId: null,
      counterpartySupplierId: null,
      account: '현금',
      category: '기타',
      relatedPurchaseOrderId: null,
      relatedProductionContractId: null,
      note: null,
      createdBy: 1,
      ...overrides,
    }) as CashVoucher;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashVouchersService,
        {
          provide: getRepositoryToken(CashVoucher),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CashVouchersService);
    repo = module.get(getRepositoryToken(CashVoucher));
  });

  it('입금/출금 합계와 잔액을 정확히 계산한다', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      makeVoucher({ voucherType: CashVoucherType.DEPOSIT, amount: 1000 }),
      makeVoucher({ voucherType: CashVoucherType.DEPOSIT, amount: 2000 }),
      makeVoucher({ voucherType: CashVoucherType.WITHDRAWAL, amount: 500 }),
    ]);

    const summary = await service.getSummary();

    expect(summary.depositTotal).toBe(3000);
    expect(summary.withdrawalTotal).toBe(500);
    expect(summary.balance).toBe(2500);
  });

  it('전표가 하나도 없으면 전부 0이다', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);

    const summary = await service.getSummary();

    expect(summary).toEqual({ depositTotal: 0, withdrawalTotal: 0, balance: 0 });
  });

  it('출금이 입금보다 많으면 잔액이 음수여야 한다', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      makeVoucher({ voucherType: CashVoucherType.DEPOSIT, amount: 100 }),
      makeVoucher({ voucherType: CashVoucherType.WITHDRAWAL, amount: 300 }),
    ]);

    const summary = await service.getSummary();

    expect(summary.balance).toBe(-200);
  });

  it('DB가 문자열로 반환하는 decimal amount도 숫자로 정확히 합산한다(pg 드라이버 특성)', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      makeVoucher({ voucherType: CashVoucherType.DEPOSIT, amount: '1500.50' as any }),
      makeVoucher({ voucherType: CashVoucherType.WITHDRAWAL, amount: '200.25' as any }),
    ]);

    const summary = await service.getSummary();

    expect(summary.depositTotal).toBeCloseTo(1500.5);
    expect(summary.withdrawalTotal).toBeCloseTo(200.25);
    expect(summary.balance).toBeCloseTo(1300.25);
  });

  it('from/to 기간 필터를 repository.find where 조건에 전달한다', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);

    await service.getSummary('2026-09-01', '2026-09-30');

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ voucherDate: expect.anything() }),
      }),
    );
  });

  it('from/to를 모두 생략하면 전체 기간을 대상으로 한다(where에 voucherDate 조건 없음)', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);

    await service.getSummary();

    expect(repo.find).toHaveBeenCalledWith({ where: {} });
  });

  // PR-108: 거래내역서 발급 — 특정 거래처(Buyer/Supplier)로 필터링된 요약/목록만
  // 뽑아낼 수 있어야 한다. 실제 DB 필터링은 findAll()이 하므로, 여기서는 서비스가
  // repository.find에 정확한 where 조건을 전달하는지(다른 거래처 조건과 섞이지
  // 않는지) 확인한다.
  describe('거래처 필터 (PR-108)', () => {
    it('getSummary에 buyerId를 주면 where에 counterpartyBuyerId가 포함된다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      await service.getSummary(undefined, undefined, 7, undefined);

      expect(repo.find).toHaveBeenCalledWith({ where: { counterpartyBuyerId: 7 } });
    });

    it('getSummary에 supplierId를 주면 where에 counterpartySupplierId가 포함된다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      await service.getSummary(undefined, undefined, undefined, 9);

      expect(repo.find).toHaveBeenCalledWith({ where: { counterpartySupplierId: 9 } });
    });

    it('getSummary에 기간+buyerId를 함께 주면 둘 다 where에 포함된다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      await service.getSummary('2026-09-01', '2026-09-30', 7, undefined);

      expect(repo.find).toHaveBeenCalledWith({
        where: expect.objectContaining({ voucherDate: expect.anything(), counterpartyBuyerId: 7 }),
      });
    });

    it('findAll에 buyerId를 주면 그 거래처의 전표만 반환한다(다른 거래처 전표는 섞이지 않음)', async () => {
      (repo.find as jest.Mock).mockResolvedValue([makeVoucher({ id: 1, counterpartyBuyerId: 7 })]);

      const result = await service.findAll({ buyerId: 7 });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ counterpartyBuyerId: 7 }) }),
      );
      expect(result).toHaveLength(1);
    });

    it('findAll에 buyerId/supplierId를 모두 주지 않으면 거래처 조건 없이 조회한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      await service.findAll({});

      const calledWhere = (repo.find as jest.Mock).mock.calls[0][0].where;
      expect(calledWhere.counterpartyBuyerId).toBeUndefined();
      expect(calledWhere.counterpartySupplierId).toBeUndefined();
    });
  });
});
