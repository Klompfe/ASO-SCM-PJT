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
});
