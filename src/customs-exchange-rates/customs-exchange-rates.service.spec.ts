import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomsExchangeRatesService } from './customs-exchange-rates.service';
import { CustomsExchangeRate, ExchangeRateType } from './entities/customs-exchange-rate.entity';

// PR-184: 주간 환율 — 기간 검증/겹침 거절, lookup 경계값, previous 참고값, status(한국시간 오늘).
describe('CustomsExchangeRatesService', () => {
  let service: CustomsExchangeRatesService;
  let repo: jest.Mocked<Partial<Repository<CustomsExchangeRate>>>;
  let qb: any;

  const buildQb = (result: any, overlapResult: any = null) => {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return builder;
  };

  beforeEach(async () => {
    qb = buildQb(null);
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      create: jest.fn((v) => v) as any,
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) as any,
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined) as any,
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomsExchangeRatesService, { provide: getRepositoryToken(CustomsExchangeRate), useValue: repo }],
    }).compile();
    service = module.get(CustomsExchangeRatesService);
  });

  describe('create', () => {
    it('시작일이 종료일보다 늦으면 400', async () => {
      await expect(
        service.create({ rateType: ExchangeRateType.EXPORT, validFrom: '2026-10-10', validTo: '2026-10-01', rate: 1300 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('0 이하 환율은 DTO 검증 대상이라 서비스 호출 전에 걸리지만, 서비스는 겹침 없으면 그대로 저장한다', async () => {
      qb.getOne.mockResolvedValue(null);
      const result = await service.create({ rateType: ExchangeRateType.EXPORT, validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1343 } as any);
      expect(result).toEqual(expect.objectContaining({ rateType: ExchangeRateType.EXPORT, currency: 'USD' }));
    });

    it('같은 구분+통화에서 기간이 겹치면 400이고 충돌 기간을 메시지에 담는다', async () => {
      qb.getOne.mockResolvedValue({ id: 9, validFrom: '2026-10-01', validTo: '2026-10-07' });
      const err = await service
        .create({ rateType: ExchangeRateType.EXPORT, validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1343 } as any)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('2026-10-01');
      expect(err.message).toContain('2026-10-07');
    });

    it('구분이 다르면(EXPORT vs IMPORT) 같은 기간이어도 허용된다 — assertNoOverlap에 rateType이 조건으로 들어간다', async () => {
      qb.getOne.mockResolvedValue(null); // IMPORT 쪽엔 겹치는 행이 없다고 가정
      await expect(
        service.create({ rateType: ExchangeRateType.IMPORT, validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1350 } as any),
      ).resolves.toEqual(expect.objectContaining({ rateType: ExchangeRateType.IMPORT }));
      expect(qb.where).toHaveBeenCalledWith('r.rateType = :rateType', { rateType: ExchangeRateType.IMPORT });
    });
  });

  describe('update', () => {
    it('없는 id는 404', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.update(999, { rate: 1300 } as any)).rejects.toThrow(NotFoundException);
    });

    it('수정 시 자기 자신은 겹침 검사에서 제외한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 5, rateType: ExchangeRateType.EXPORT, currency: 'USD', validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1343,
      });
      qb.getOne.mockResolvedValue(null);
      await service.update(5, { rate: 1350 } as any);
      expect(qb.andWhere).toHaveBeenCalledWith('r.id != :excludeId', { excludeId: 5 });
    });

    it('수정으로 바뀐 기간이 다른 행과 겹치면 400', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 5, rateType: ExchangeRateType.EXPORT, currency: 'USD', validFrom: '2026-10-05', validTo: '2026-10-11', rate: 1343,
      });
      qb.getOne.mockResolvedValue({ id: 6, validFrom: '2026-10-12', validTo: '2026-10-18' });
      await expect(service.update(5, { validTo: '2026-10-13' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('없는 id는 404, 있으면 삭제한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);

      (repo.findOne as jest.Mock).mockResolvedValueOnce({ id: 2 });
      await service.remove(2);
      expect(repo.remove).toHaveBeenCalled();
    });
  });

  describe('lookup', () => {
    it('날짜 형식이 아니면 400', async () => {
      await expect(service.lookup(ExchangeRateType.EXPORT, 'USD', '2026/10/07')).rejects.toThrow(BadRequestException);
    });

    it('경계일(validFrom, validTo 당일)도 포함해서 찾는다', async () => {
      qb.getOne.mockResolvedValueOnce({ rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' });
      const fromResult = await service.lookup(ExchangeRateType.EXPORT, 'USD', '2026-10-05');
      expect(fromResult).toEqual({ found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11', rateType: ExchangeRateType.EXPORT });
    });

    it('범위 밖이면 found:false이고, 직전 등록 주를 previous로만 알려준다(자동 적용 아님)', async () => {
      qb.getOne
        .mockResolvedValueOnce(null) // 정확히 일치하는 행 없음
        .mockResolvedValueOnce({ rate: 1300, validFrom: '2026-09-28', validTo: '2026-10-04' }); // previous
      const result = await service.lookup(ExchangeRateType.EXPORT, 'USD', '2026-10-20');
      expect(result).toEqual({ found: false, previous: { rate: 1300, validFrom: '2026-09-28', validTo: '2026-10-04' } });
    });

    it('직전 등록 주도 없으면 previous:null', async () => {
      qb.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const result = await service.lookup(ExchangeRateType.EXPORT, 'USD', '2026-01-01');
      expect(result).toEqual({ found: false, previous: null });
    });
  });

  describe('status', () => {
    it('date를 생략하면 한국시간 기준 오늘로 EXPORT/IMPORT를 함께 조회한다', async () => {
      qb.getOne.mockResolvedValue(null);
      const result = await service.status('USD');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.EXPORT).toEqual({ found: false, previous: null });
      expect(result.IMPORT).toEqual({ found: false, previous: null });
    });

    it('date를 지정하면 그 날짜로 조회한다', async () => {
      qb.getOne.mockResolvedValue(null);
      const result = await service.status('USD', '2026-10-07');
      expect(result.date).toBe('2026-10-07');
    });
  });
});
