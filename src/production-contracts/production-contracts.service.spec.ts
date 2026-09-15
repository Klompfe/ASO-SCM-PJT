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
});
