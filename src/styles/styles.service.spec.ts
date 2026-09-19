import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StylesService } from './styles.service';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview } from './entities/style-overview.entity';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';

// PR-101: findAll()에 추가된 itemType 필터(정확히 일치)를 검증한다 — styleNo/기간
// 필터와 달리 부분일치가 아니라 exact match여야 한다.
describe('StylesService.findAll — itemType 필터 (PR-101)', () => {
  let service: StylesService;
  let queryBuilder: any;
  let masterStyleRepository: Repository<MasterStyle>;
  const mockBrandPrefixRulesService = { findAll: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBrandPrefixRulesService.findAll.mockResolvedValue([]);
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StylesService,
        {
          provide: getRepositoryToken(MasterStyle),
          useValue: { createQueryBuilder: jest.fn(() => queryBuilder) },
        },
        { provide: getRepositoryToken(StyleOverview), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: BrandPrefixRulesService, useValue: mockBrandPrefixRulesService },
      ],
    }).compile();

    service = module.get(StylesService);
    masterStyleRepository = module.get(getRepositoryToken(MasterStyle));
  });

  it('itemType을 지정하면 정확히 일치(=)로 andWhere가 걸린다', async () => {
    await service.findAll({ itemType: 'JK' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('overview.itemType = :itemType', { itemType: 'JK' });
  });

  it('itemType을 지정하지 않으면 itemType 관련 andWhere가 걸리지 않는다', async () => {
    await service.findAll({});

    const itemTypeCalls = queryBuilder.andWhere.mock.calls.filter(([sql]: any) => sql.includes('itemType'));
    expect(itemTypeCalls).toHaveLength(0);
  });

  it('filter 자체가 없으면(undefined) 아무 andWhere도 걸리지 않고 전체를 반환한다', async () => {
    await service.findAll();

    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
  });

  it('itemType과 styleNo를 함께 지정하면 둘 다 andWhere로 걸린다(조합 가능)', async () => {
    await service.findAll({ itemType: 'JK', styleNo: 'MB6' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('style.styleNo LIKE :styleNo', { styleNo: '%MB6%' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('overview.itemType = :itemType', { itemType: 'JK' });
  });

  // PR-111: 스타일번호 접두사로 브랜드를 계산해 붙이고, brand 필터가 있으면
  // 조회 시점(메모리)에서 걸러낸다.
  describe('브랜드 분류/필터 (PR-111)', () => {
    beforeEach(() => {
      mockBrandPrefixRulesService.findAll.mockResolvedValue([
        { prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
        { prefix: 'MB', isNumericStart: false, brandName: '미센스' },
      ]);
    });

    it('각 스타일에 접두사로 계산한 brand를 붙여 반환한다', async () => {
      queryBuilder.getMany.mockResolvedValue([{ styleNo: 'BF6821C13' }, { styleNo: 'MB6YHMP104Z' }, { styleNo: 'ZZ9999' }]);

      const result = await service.findAll();

      expect(result.map((r) => r.brand)).toEqual(['빈폴', '미센스', null]);
    });

    it('brand 필터를 지정하면 해당 브랜드만 반환한다', async () => {
      queryBuilder.getMany.mockResolvedValue([{ styleNo: 'BF6821C13' }, { styleNo: 'MB6YHMP104Z' }]);

      const result = await service.findAll({ brand: '빈폴' });

      expect(result).toHaveLength(1);
      expect(result[0].styleNo).toBe('BF6821C13');
    });
  });
});
