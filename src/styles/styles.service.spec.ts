import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StylesService } from './styles.service';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview } from './entities/style-overview.entity';

// PR-101: findAll()에 추가된 itemType 필터(정확히 일치)를 검증한다 — styleNo/기간
// 필터와 달리 부분일치가 아니라 exact match여야 한다.
describe('StylesService.findAll — itemType 필터 (PR-101)', () => {
  let service: StylesService;
  let queryBuilder: any;
  let masterStyleRepository: Repository<MasterStyle>;

  beforeEach(async () => {
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
});
