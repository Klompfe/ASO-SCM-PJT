import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesContractPricesService } from './sales-contract-prices.service';
import { SalesContractPriceRow } from './entities/sales-contract-price-row.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';

describe('SalesContractPricesService (PR-166)', () => {
  let service: SalesContractPricesService;
  const mockRowRepo = { find: jest.fn(), findOne: jest.fn(), count: jest.fn() };
  const mockStyleRepo = { findOne: jest.fn() };
  const mockBrandRules = { findAll: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesContractPricesService,
        { provide: getRepositoryToken(SalesContractPriceRow), useValue: mockRowRepo },
        { provide: getRepositoryToken(MasterStyle), useValue: mockStyleRepo },
        { provide: BrandPrefixRulesService, useValue: mockBrandRules },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(SalesContractPricesService);
  });

  describe('resolve', () => {
    // 버그 재현 + 회귀 방지: TypeORM은 decimal 컬럼을 문자열로 반환한다(예: "10.0000").
    // 숫자로 미리 변환하지 않으면 평균 계산(0+"10.0000")이 문자열 연결이 되어 편차가
    // 큰 그룹도 "평균 신뢰 가능(BRAND_CATEGORY_AVERAGE)"으로 잘못 분류된다 — 반드시
    // NEEDS_REVIEW로 떨어져야 한다.
    it('repository가 decimal을 문자열로 반환해도(TypeORM 실제 동작) 편차가 큰 그룹은 NEEDS_REVIEW로 정확히 분류된다', async () => {
      mockBrandRules.findAll.mockResolvedValue([{ prefix: 'BF', isNumericStart: false, brandName: '빈폴' }]);
      mockStyleRepo.findOne.mockResolvedValue(null);
      mockRowRepo.find.mockResolvedValue([
        { styleNo: 'BF1', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: '4.5000' },
        { styleNo: 'BF2', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: '8.5000' },
        { styleNo: 'BF3', brand: '빈폴', category: "WOMEN'S PANTS", unitPrice: '6.5000' },
      ]);

      const result = await service.resolve('BF99', "WOMEN'S PANTS");

      expect(result.confidence).toBe('NEEDS_REVIEW');
      expect(result.price).toBeNull();
      expect(result.priceMin).toBe(4.5);
      expect(result.priceMax).toBe(8.5);
      expect(result.note).not.toContain('NaN');
    });

    it('문자열 decimal이어도 편차가 작은 그룹은 정확한 숫자 평균을 낸다', async () => {
      mockBrandRules.findAll.mockResolvedValue([{ prefix: 'LB', isNumericStart: false, brandName: '루미에반' }]);
      mockStyleRepo.findOne.mockResolvedValue(null);
      mockRowRepo.find.mockResolvedValue([
        { styleNo: 'LB1', brand: '루미에반', category: "WOMEN'S COAT", unitPrice: '10.0000' },
        { styleNo: 'LB2', brand: '루미에반', category: "WOMEN'S COAT", unitPrice: '10.0000' },
      ]);

      const result = await service.resolve('LB99', "WOMEN'S COAT");

      expect(result.confidence).toBe('BRAND_CATEGORY_AVERAGE');
      expect(result.price).toBe(10);
      expect(typeof result.price).toBe('number');
    });

    it('정확매칭이면 문자열 decimal도 number로 변환해 돌려준다', async () => {
      mockBrandRules.findAll.mockResolvedValue([{ prefix: 'KM', isNumericStart: false, brandName: '킴마틴' }]);
      mockRowRepo.find.mockResolvedValue([
        { styleNo: 'KM1', brand: '킴마틴', category: "WOMEN'S JUMPER", unitPrice: '7.0000' },
      ]);

      const result = await service.resolve('KM1');

      expect(result.confidence).toBe('EXACT_STYLE_MATCH');
      expect(result.price).toBe(7);
      expect(typeof result.price).toBe('number');
    });

    it('itemType을 안 넘기면 MasterStyle.overview.itemType을 조회해서 쓴다', async () => {
      mockBrandRules.findAll.mockResolvedValue([{ prefix: 'LB', isNumericStart: false, brandName: '루미에반' }]);
      mockStyleRepo.findOne.mockResolvedValue({ styleNo: 'LB99', overview: { itemType: "WOMEN'S COAT" } });
      mockRowRepo.find.mockResolvedValue([
        { styleNo: 'LB1', brand: '루미에반', category: "WOMEN'S COAT", unitPrice: '10.0000' },
      ]);

      const result = await service.resolve('LB99');

      expect(result.category).toBe("WOMEN'S COAT");
      expect(result.confidence).toBe('BRAND_CATEGORY_AVERAGE');
    });
  });
});
