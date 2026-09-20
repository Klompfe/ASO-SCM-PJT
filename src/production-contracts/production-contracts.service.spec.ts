import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductionContractsService } from './production-contracts.service';
import {
  ProductionContract,
  ProductionContractPriceSource,
  ProductionContractPriceStatus,
} from './entities/production-contract.entity';

describe('ProductionContractsService (PR-093)', () => {
  let service: ProductionContractsService;
  let repo: Repository<ProductionContract>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionContractsService,
        {
          provide: getRepositoryToken(ProductionContract),
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

    service = module.get(ProductionContractsService);
    repo = module.get(getRepositoryToken(ProductionContract));
  });

  describe('create — priceSource/cmtPrice 조합 검증', () => {
    it('PRE_AGREED인데 cmtPrice가 없으면 400을 던진다', async () => {
      await expect(
        service.create({
          styleNo: 'ST-1',
          manufacturerId: 1,
          priceSource: ProductionContractPriceSource.PRE_AGREED,
          quantity: 100,
          contractDate: '2026-09-15',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('CMT_INVOICE인데 cmtPrice가 있으면 400을 던진다', async () => {
      await expect(
        service.create({
          styleNo: 'ST-1',
          manufacturerId: 1,
          priceSource: ProductionContractPriceSource.CMT_INVOICE,
          cmtPrice: 10,
          quantity: 100,
          contractDate: '2026-09-15',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('PRE_AGREED + cmtPrice가 있으면 정상 저장되고 priceStatus가 CONFIRMED다', async () => {
      const result = await service.create({
        styleNo: 'ST-1',
        manufacturerId: 1,
        priceSource: ProductionContractPriceSource.PRE_AGREED,
        cmtPrice: 12.5,
        quantity: 100,
        contractDate: '2026-09-15',
      } as any);

      expect(result.cmtPrice).toBe(12.5);
      expect(result.priceStatus).toBe(ProductionContractPriceStatus.CONFIRMED);
    });

    it('CMT_INVOICE + cmtPrice 없이 저장하면 cmtPrice가 null이고 priceStatus가 PENDING_CMT_INVOICE다', async () => {
      const result = await service.create({
        styleNo: 'ST-1',
        manufacturerId: 1,
        priceSource: ProductionContractPriceSource.CMT_INVOICE,
        quantity: 100,
        contractDate: '2026-09-15',
      } as any);

      expect(result.cmtPrice).toBeNull();
      expect(result.priceStatus).toBe(ProductionContractPriceStatus.PENDING_CMT_INVOICE);
    });
  });

  // PR-127: 입출금전표 "관련 생산계약 연결"의 검색 선택 — keyword(스타일번호/제조사명) + 선택적 page/limit.
  describe('findAll — keyword/페이지네이션 (PR-127)', () => {
    const buildQb = (result: any[] = []) => {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(result),
      };
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    };

    it('keyword/page/limit가 없으면 기존과 같이 find()로 전량을 id 내림차순 조회한다(skip/take 없음, 배열 그대로)', async () => {
      (repo.find as jest.Mock).mockResolvedValue([{ id: 2 }, { id: 1 }]);
      const result = await service.findAll({});
      expect(result).toEqual([{ id: 2 }, { id: 1 }]);
      expect(repo.find).toHaveBeenCalledWith({ where: {}, relations: ['manufacturer'], order: { id: 'DESC' } });
    });

    it('page/limit만 주면 find()에 skip/take가 실제로 붙는다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.findAll({ page: 2, limit: 5 });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    });

    it('keyword가 있으면 스타일번호/제조사명 LOWER() LIKE LOWER() 부분일치 쿼리로 조회하고 기간 조건도 함께 건다', async () => {
      const qb = buildQb([{ id: 4 }]);
      const result = await service.findAll({ keyword: ' Alpha ', from: '2026-09-01', to: '2026-09-30', page: 1, limit: 20 });
      expect(result).toEqual([{ id: 4 }]);
      const [clause, params] = qb.where.mock.calls[0];
      expect(clause).toContain('LOWER(pc.styleNo) LIKE LOWER(:kw)');
      expect(clause).toContain('LOWER(manufacturer.name) LIKE LOWER(:kw)');
      expect(params).toEqual({ kw: '%Alpha%' });
      expect(qb.andWhere).toHaveBeenCalledWith('pc.contractDate >= :from', { from: '2026-09-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('pc.contractDate <= :to', { to: '2026-09-30' });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});
