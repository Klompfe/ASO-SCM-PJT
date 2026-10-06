import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuppliersService } from './suppliers.service';
import { Supplier } from './entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { MaterialCategory } from '../material-categories/entities/material-category.entity';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let repo: Repository<Supplier>;
  let itemRepo: Repository<Item>;

  const currentYy = String(new Date().getFullYear() % 100).padStart(2, '0');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: getRepositoryToken(Supplier),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Item),
          useValue: {
            findBy: jest.fn().mockResolvedValue([]),
          },
        },
        {
          // PR-183: categoryIds 해석용. 기본은 빈 결과(기존 테스트는 품목군을 쓰지 않음).
          provide: getRepositoryToken(MaterialCategory),
          useValue: {
            findBy: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(SuppliersService);
    repo = module.get(getRepositoryToken(Supplier));
    itemRepo = module.get(getRepositoryToken(Item));
  });

  describe('create — 업체약칭 결정', () => {
    it('abbrCode를 지정하면 trim+uppercase해서 그대로 쓴다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'Global Materials', abbrCode: ' gm ' } as any);

      expect(result.code).toBe(`TY-GM-${currentYy}0001`);
      expect((result as any).abbrCode).toBe('GM');
    });

    it('abbrCode 미지정 시 업체명에서 알파벳 앞 2글자를 대문자로 추출한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'globalmat trading co.' } as any);

      expect(result.code).toBe(`TY-GL-${currentYy}0001`);
    });

    it('알파벳이 1글자뿐이면 그 글자+X로 채운다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: '미도 A상사' } as any);

      expect(result.code).toBe(`TY-AX-${currentYy}0001`);
    });

    it('알파벳이 전혀 없으면(순수 한글 업체명) 기본값(SP)을 쓴다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: '미도자재상사' } as any);

      expect(result.code).toBe(`TY-SP-${currentYy}0001`);
    });
  });

  describe('create — 일련번호 채번', () => {
    it('같은 약칭으로 연속 등록하면 일련번호가 증가한다', async () => {
      (repo.find as jest.Mock).mockResolvedValueOnce([]);
      const first = await service.create({ name: 'Global Materials', abbrCode: 'GM' } as any);
      expect(first.code).toBe(`TY-GM-${currentYy}0001`);

      (repo.find as jest.Mock).mockResolvedValueOnce([{ code: `TY-GM-${currentYy}0001` }]);
      const second = await service.create({ name: 'Global Materials', abbrCode: 'GM' } as any);
      expect(second.code).toBe(`TY-GM-${currentYy}0002`);
    });

    it('다른 약칭은 독립적으로 0001부터 시작한다', async () => {
      (repo.find as jest.Mock).mockResolvedValueOnce([{ code: `TY-GM-${currentYy}0001` }, { code: `TY-GM-${currentYy}0002` }]);
      const supplierGm = await service.create({ name: 'Global Materials', abbrCode: 'GM' } as any);
      expect(supplierGm.code).toBe(`TY-GM-${currentYy}0003`);

      (repo.find as jest.Mock).mockResolvedValueOnce([]);
      const supplierXx = await service.create({ name: 'Xylophone Supply', abbrCode: 'XX' } as any);
      expect(supplierXx.code).toBe(`TY-XX-${currentYy}0001`);
    });

    it('중간에 삭제된 행이 있어도(COUNT 아닌 최댓값 방식) 기존 최댓값+1로 채번한다', async () => {
      // 0001, 0003만 남아있는 상황(0002는 삭제됨) — COUNT 방식이면 0003을 만들지만
      // 최댓값 방식은 0004가 되어야 한다.
      (repo.find as jest.Mock).mockResolvedValueOnce([
        { code: `TY-GM-${currentYy}0001` },
        { code: `TY-GM-${currentYy}0003` },
      ]);

      const result = await service.create({ name: 'Global Materials', abbrCode: 'GM' } as any);

      expect(result.code).toBe(`TY-GM-${currentYy}0004`);
    });
  });

  describe('create — 업체명만으로 등록', () => {
    it('name만 있어도 성공한다(나머지 필드 없이)', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'Only Name Supplier' } as any);

      expect(result.code).toBeDefined();
      expect(result).toEqual(expect.objectContaining({ name: 'Only Name Supplier' }));
    });
  });

  describe('create — 동시성(TOCTOU) 재시도', () => {
    it('unique 제약 위반이면 재계산 후 재시도해 결국 성공한다', async () => {
      (repo.find as jest.Mock)
        .mockResolvedValueOnce([]) // 1차 계산: 0001
        .mockResolvedValueOnce([{ code: `TY-GM-${currentYy}0001` }]); // 재시도 계산: 0002

      let callCount = 0;
      (repo.save as jest.Mock).mockImplementation((v: any) => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('duplicate key');
          err.code = '23505';
          return Promise.reject(err);
        }
        return Promise.resolve({ id: 1, ...v });
      });

      const result = await service.create({ name: 'Global Materials', abbrCode: 'GM' } as any);

      expect(result.code).toBe(`TY-GM-${currentYy}0002`);
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('재시도를 모두 소진하면 ConflictException을 던진다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const err: any = new Error('duplicate key');
      err.code = '23505';
      (repo.save as jest.Mock).mockRejectedValue(err);

      await expect(service.create({ name: 'Global Materials', abbrCode: 'GM' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('unique 위반이 아닌 다른 에러는 그대로 던진다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const err = new Error('some other db error');
      (repo.save as jest.Mock).mockRejectedValue(err);

      await expect(service.create({ name: 'Global Materials', abbrCode: 'GM' } as any)).rejects.toThrow(
        'some other db error',
      );
    });
  });

  // PR-126: 발주 화면 공급업체 "검색 선택" — keyword 부분일치(대소문자 무시).
  describe('findAll — keyword 검색 (PR-126)', () => {
    const buildQb = (result: any[]) => {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(result),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      return qb;
    };

    it('keyword가 없으면(또는 공백이면) 기존과 같이 전체를 id 내림차순으로 조회한다(쿼리빌더 안 씀) — mainItems 관계도 함께 로드', async () => {
      (repo.find as jest.Mock).mockResolvedValue([{ id: 2 }, { id: 1 }]);
      expect(await service.findAll()).toEqual([{ id: 2 }, { id: 1 }]);
      await service.findAll({ keyword: '   ' });
      await service.findAll({});
      // PR-183: 응답에 취급 품목군(categories)도 함께 실린다.
      expect(repo.find).toHaveBeenCalledWith({ relations: ['mainItems', 'categories'], order: { id: 'DESC' } });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('keyword가 있으면 업체명/코드/약칭에 LOWER() LIKE LOWER() 부분일치 조건을 건다(양쪽 DB에서 대소문자 무시) — mainItems도 조인', async () => {
      const qb = buildQb([{ id: 3, name: 'Alpha Textile' }]);
      const result = await service.findAll({ keyword: ' Alpha ' });
      expect(result).toEqual([{ id: 3, name: 'Alpha Textile' }]);
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('s.mainItems', 'mainItems');
      const [clause, params] = qb.where.mock.calls[0];
      expect(clause).toContain('LOWER(s.name) LIKE LOWER(:kw)');
      expect(clause).toContain('LOWER(s.code) LIKE LOWER(:kw)');
      expect(clause).toContain('LOWER(s.abbrCode) LIKE LOWER(:kw)');
      expect(params).toEqual({ kw: '%Alpha%' }); // 앞뒤 공백은 제거
      expect(qb.orderBy).toHaveBeenCalledWith('s.id', 'DESC');
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  // PR-171: 공급업체 "주요품목" 다중 연결.
  describe('create/update — 주요품목(mainItems) 연결', () => {
    it('mainItemIds 없이 등록하면 mainItems는 빈 배열로 저장된다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const result = await service.create({ name: 'No Items Supplier' } as any);
      expect(itemRepo.findBy).not.toHaveBeenCalled();
      expect((result as any).mainItems).toEqual([]);
    });

    it('mainItemIds를 1개 주면 해당 Item으로 조회해 연결한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      (itemRepo.findBy as jest.Mock).mockResolvedValue([{ id: 10, name: '원단A' }]);
      const result = await service.create({ name: 'One Item Supplier', mainItemIds: [10] } as any);
      expect((result as any).mainItems).toEqual([{ id: 10, name: '원단A' }]);
    });

    it('mainItemIds를 여러 개 주면 전부 연결한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      (itemRepo.findBy as jest.Mock).mockResolvedValue([
        { id: 10, name: '원단A' },
        { id: 11, name: '원단B' },
      ]);
      const result = await service.create({ name: 'Multi Item Supplier', mainItemIds: [10, 11] } as any);
      expect((result as any).mainItems).toHaveLength(2);
    });

    it('존재하지 않는 품목 ID가 섞여 있으면 BadRequestException을 던진다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      (itemRepo.findBy as jest.Mock).mockResolvedValue([{ id: 10, name: '원단A' }]);
      await expect(
        service.create({ name: 'Bad Item Supplier', mainItemIds: [10, 999] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('update에서 mainItemIds를 보내지 않으면(undefined) 기존 mainItems를 건드리지 않는다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: 'Existing', mainItems: [{ id: 5, name: '기존품목' }] });
      await service.update(1, { name: 'Renamed' } as any);
      expect(itemRepo.findBy).not.toHaveBeenCalled();
      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.mainItems).toEqual([{ id: 5, name: '기존품목' }]);
    });

    it('update에서 mainItemIds를 빈 배열로 보내면 기존 연결을 전부 해제한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: 'Existing', mainItems: [{ id: 5, name: '기존품목' }] });
      await service.update(1, { mainItemIds: [] } as any);
      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.mainItems).toEqual([]);
    });

    it('update에서 mainItemIds를 새로 보내면 기존 연결을 새 목록으로 교체한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, name: 'Existing', mainItems: [{ id: 5, name: '기존품목' }] });
      (itemRepo.findBy as jest.Mock).mockResolvedValue([{ id: 20, name: '새품목' }]);
      await service.update(1, { mainItemIds: [20] } as any);
      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.mainItems).toEqual([{ id: 20, name: '새품목' }]);
    });
  });

  // PR-183: 취급 품목군(categoryIds) 연결 — undefined=변경 없음, []=전부 해제, 없는 id=400.
  describe('create/update — 취급 품목군(categoryIds) 연결', () => {
    it('categoryIds를 여러 개 주면 해당 품목군들을 연결해 저장한다', async () => {
      const cats = [{ id: 1, name: '겉감' }, { id: 3, name: '실' }];
      const categoryRepo = (service as any).categoryRepository;
      categoryRepo.findBy.mockResolvedValueOnce(cats);
      (repo.find as jest.Mock).mockResolvedValue([]);
      const result = await service.create({ name: '품목군 업체', categoryIds: [1, 3] } as any);
      expect(result.categories).toEqual(cats);
    });

    it('categoryIds를 빈 배열로 보내면 연결 없이 저장한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const result = await service.create({ name: '품목군 없음', categoryIds: [] } as any);
      expect(result.categories).toEqual([]);
    });

    it('존재하지 않는 품목군 ID가 섞여 있으면 400', async () => {
      const categoryRepo = (service as any).categoryRepository;
      categoryRepo.findBy.mockResolvedValueOnce([{ id: 1, name: '겉감' }]);
      (repo.find as jest.Mock).mockResolvedValue([]);
      await expect(service.create({ name: 'X', categoryIds: [1, 999] } as any)).rejects.toThrow(BadRequestException);
    });

    it('update에서 categoryIds를 보내지 않으면 기존 품목군을 건드리지 않는다', async () => {
      const existing = { id: 7, name: 'A', categories: [{ id: 1 }] };
      (repo.findOne as jest.Mock).mockResolvedValue(existing);
      const result = await service.update(7, { name: 'B' } as any);
      expect(result.categories).toEqual([{ id: 1 }]);
    });

    it('update에서 categoryIds를 빈 배열로 보내면 전부 해제한다', async () => {
      const existing = { id: 7, name: 'A', categories: [{ id: 1 }] };
      (repo.findOne as jest.Mock).mockResolvedValue(existing);
      const result = await service.update(7, { categoryIds: [] } as any);
      expect(result.categories).toEqual([]);
    });
  });
});
