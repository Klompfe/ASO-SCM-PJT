import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandPriceRulesService } from './brand-price-rules.service';
import { BrandPriceRule } from './entities/brand-price-rule.entity';

// PR-185: 브랜드 전용가 CRUD — (brandName, categoryKeyword) 조합 중복 거절, 활성 필터.
describe('BrandPriceRulesService', () => {
  let service: BrandPriceRulesService;
  let repo: jest.Mocked<Partial<Repository<BrandPriceRule>>>;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v) as any,
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) as any,
      remove: jest.fn().mockResolvedValue(undefined) as any,
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrandPriceRulesService, { provide: getRepositoryToken(BrandPriceRule), useValue: repo }],
    }).compile();
    service = module.get(BrandPriceRulesService);
  });

  it('같은 브랜드+품목구분 조합이 이미 있으면 등록을 거절한다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, brandName: '뮤트', categoryKeyword: '겉감' });
    await expect(service.create({ brandName: '뮤트', categoryKeyword: '겉감', priceUsd: 1, unit: 'YD' } as any)).rejects.toThrow(BadRequestException);
  });

  it('등록 시 기본값(isActive=true)을 쓴다', async () => {
    const result = await service.create({ brandName: '뮤트', categoryKeyword: '안감', priceUsd: 0.15, unit: 'YD' } as any);
    expect(result).toEqual(expect.objectContaining({ isActive: true }));
  });

  it('findActive는 활성 규칙만 조회한다', async () => {
    await service.findActive();
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('없는 id를 수정/삭제하면 404', async () => {
    await expect(service.update(999, { priceUsd: 2 } as any)).rejects.toThrow(NotFoundException);
    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });

  it('브랜드/구분을 바꾸지 않는 수정은 중복 검사를 하지 않는다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce({ id: 1, brandName: '뮤트', categoryKeyword: '겉감', priceUsd: 1, unit: 'YD', isActive: true });
    const result = await service.update(1, { priceUsd: 1.2 } as any);
    expect(result).toEqual(expect.objectContaining({ priceUsd: 1.2 }));
  });

  it('비활성으로 바꿀 수 있다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce({ id: 1, brandName: '뮤트', categoryKeyword: '겉감', isActive: true });
    const result = await service.update(1, { isActive: false } as any);
    expect(result.isActive).toBe(false);
  });
});
