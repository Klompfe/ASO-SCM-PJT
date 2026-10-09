import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialCategory } from './entities/material-category.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';

// PR-183: 품목군 관리 — 목록 정렬, 이름 중복, 사용 중 삭제 거절(400).
describe('MaterialCategoriesService', () => {
  let service: MaterialCategoriesService;
  let repo: jest.Mocked<Partial<Repository<MaterialCategory>>>;
  let qb: any;
  let supplierQb: any;
  let itemRepo: { count: jest.Mock };

  beforeEach(async () => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    supplierQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    itemRepo = { count: jest.fn().mockResolvedValue(0) };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v) as any,
      save: jest.fn((v) => Promise.resolve({ id: 5, ...v })) as any,
      remove: jest.fn().mockResolvedValue(undefined) as any,
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Supplier) return { createQueryBuilder: () => supplierQb };
        if (entity === Item) return itemRepo;
        throw new Error('unexpected repository');
      }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialCategoriesService,
        { provide: getRepositoryToken(MaterialCategory), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(MaterialCategoriesService);
  });

  it('목록은 활성 우선, 그다음 sortOrder 순으로 정렬한다', async () => {
    await service.findAll();
    expect(qb.orderBy).toHaveBeenCalledWith('c.isActive', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('c.sortOrder', 'ASC');
  });

  it('같은 이름이 이미 있으면 생성을 409로 거절한다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: '겉감' });
    await expect(service.create({ name: '겉감' } as any)).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('생성 시 sortOrder/isActive 기본값은 0과 true다', async () => {
    const result = await service.create({ name: '새 품목군' } as any);
    expect(result).toEqual(expect.objectContaining({ name: '새 품목군', sortOrder: 0, isActive: true }));
  });

  it('이름을 바꿀 때 다른 항목과 겹치면 409, 자기 자신과 같은 이름이면 통과한다', async () => {
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce({ id: 1, name: '겉감', sortOrder: 1, isActive: true })
      .mockResolvedValueOnce({ id: 2, name: '안감' });
    await expect(service.update(1, { name: '안감' } as any)).rejects.toThrow(ConflictException);

    (repo.findOne as jest.Mock).mockResolvedValueOnce({ id: 1, name: '겉감', sortOrder: 1, isActive: true });
    const same = await service.update(1, { name: '겉감', sortOrder: 3 } as any);
    expect(same).toEqual(expect.objectContaining({ name: '겉감', sortOrder: 3 }));
  });

  it('수정으로 비활성화할 수 있다(isActive false)', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce({ id: 1, name: '겉감', sortOrder: 1, isActive: true });
    const updated = await service.update(1, { isActive: false } as any);
    expect(updated.isActive).toBe(false);
  });

  it('없는 품목군을 수정하면 404', async () => {
    await expect(service.update(999, { sortOrder: 2 } as any)).rejects.toThrow(NotFoundException);
  });

  it('공급업체나 품목이 쓰고 있으면 삭제하지 않고 400으로 비활성 안내를 한다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: '실' });
    supplierQb.getCount.mockResolvedValue(2);
    itemRepo.count.mockResolvedValue(3);

    const err = await service.remove(1).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('비활성');
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('아무도 쓰지 않으면 삭제한다', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: '기타' });
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalled();
  });
});
