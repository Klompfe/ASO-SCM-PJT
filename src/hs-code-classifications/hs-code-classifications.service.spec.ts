import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HsCodeClassificationsService } from './hs-code-classifications.service';
import { HsCodeClassification } from './entities/hs-code-classification.entity';
import { StyleHsCodeMapping } from './entities/style-hs-code-mapping.entity';

describe('HsCodeClassificationsService', () => {
  let service: HsCodeClassificationsService;
  let classificationRepo: Repository<HsCodeClassification>;
  let styleMappingRepo: Repository<StyleHsCodeMapping>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HsCodeClassificationsService,
        {
          provide: getRepositoryToken(HsCodeClassification),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((v) => v),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StyleHsCodeMapping),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve(v)),
          },
        },
      ],
    }).compile();

    service = module.get(HsCodeClassificationsService);
    classificationRepo = module.get(getRepositoryToken(HsCodeClassification));
    styleMappingRepo = module.get(getRepositoryToken(StyleHsCodeMapping));
  });

  describe('lookup', () => {
    it('정확히 일치하는 분류를 반환한다', async () => {
      const found = {
        id: 1,
        itemType: "WOMEN'S JACKET",
        fabricType: '직물',
        composition: 'WOOL 98%',
        hsCode: '6202.20.1000',
      } as HsCodeClassification;
      (classificationRepo.findOne as jest.Mock).mockResolvedValue(found);

      const result = await service.lookup({
        itemType: "WOMEN'S JACKET",
        fabricType: '직물',
        composition: 'WOOL 98%',
      });

      expect(result).toBe(found);
      expect(classificationRepo.findOne).toHaveBeenCalledWith({
        where: { itemType: "WOMEN'S JACKET", fabricType: '직물', composition: 'WOOL 98%' },
      });
    });

    it('일치하는 조합이 없으면 404를 던진다', async () => {
      (classificationRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.lookup({ itemType: 'X', fabricType: 'Y', composition: 'Z' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByStyle', () => {
    it('styleNo로 매핑을 조회해 분류를 반환한다', async () => {
      const classification = { id: 1, hsCode: '6202.20.1000' } as HsCodeClassification;
      (styleMappingRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        styleNo: 'BF6X27C51',
        classificationId: 1,
        classification,
      });

      const result = await service.findByStyle('BF6X27C51');

      expect(result).toBe(classification);
      expect(styleMappingRepo.findOne).toHaveBeenCalledWith({
        where: { styleNo: 'BF6X27C51' },
        relations: ['classification'],
      });
    });

    it('매핑이 없으면 404를 던진다', async () => {
      (styleMappingRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findByStyle('NO-SUCH-STYLE')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertStyleMapping', () => {
    it('매핑이 없으면 새로 만든다', async () => {
      (styleMappingRepo.findOne as jest.Mock).mockResolvedValue(null);

      await service.upsertStyleMapping('BF6X27C51', 5);

      expect(styleMappingRepo.create).toHaveBeenCalledWith({ styleNo: 'BF6X27C51', classificationId: 5 });
    });

    it('기존 styleNo를 다른 조합으로 재지정하면 같은 행을 갱신한다(새로 만들지 않음)', async () => {
      const existing = { id: 1, styleNo: 'BF6X27C51', classificationId: 10 };
      (styleMappingRepo.findOne as jest.Mock).mockResolvedValue(existing);

      await service.upsertStyleMapping('BF6X27C51', 99);

      expect(styleMappingRepo.create).not.toHaveBeenCalled();
      expect(styleMappingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, classificationId: 99 }),
      );
    });
  });

  describe('findAll — styleNos 그룹핑', () => {
    const buildQueryBuilder = (items: any[], total: number) => {
      const qb: any = {
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([items, total]),
      };
      return qb;
    };

    it('같은 classification에 스타일 2개가 연결된 경우 styleNos 배열에 둘 다 담는다', async () => {
      const items = [
        { id: 1, itemType: "WOMEN'S PANTS", fabricType: '직물', composition: 'COTTON 100%' },
        { id: 2, itemType: "WOMEN'S JACKET", fabricType: '직물', composition: 'WOOL 100%' },
      ];
      (classificationRepo.createQueryBuilder as jest.Mock).mockReturnValue(buildQueryBuilder(items, 2));
      (styleMappingRepo.find as jest.Mock).mockResolvedValue([
        { styleNo: 'STY-A', classificationId: 1 },
        { styleNo: 'STY-B', classificationId: 1 },
        { styleNo: 'STY-C', classificationId: 2 },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(styleMappingRepo.find).toHaveBeenCalledWith({ where: { classificationId: expect.anything() } });
      const item1 = result.items.find((i: any) => i.id === 1)!;
      const item2 = result.items.find((i: any) => i.id === 2)!;
      expect(item1.styleNos.sort()).toEqual(['STY-A', 'STY-B']);
      expect(item2.styleNos).toEqual(['STY-C']);
    });

    it('연결된 스타일이 없는 classification은 styleNos가 빈 배열이다', async () => {
      const items = [{ id: 1, itemType: "WOMEN'S PANTS", fabricType: '직물', composition: 'COTTON 100%' }];
      (classificationRepo.createQueryBuilder as jest.Mock).mockReturnValue(buildQueryBuilder(items, 1));
      (styleMappingRepo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.items[0].styleNos).toEqual([]);
    });

    it('styleNo 필터가 있으면 매핑 테이블을 조인하고 distinct를 적용한다', async () => {
      const qb = buildQueryBuilder([], 0);
      (classificationRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (styleMappingRepo.find as jest.Mock).mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10, styleNo: 'BF6X' } as any);

      expect(qb.innerJoin).toHaveBeenCalled();
      expect(qb.distinct).toHaveBeenCalledWith(true);
    });
  });
});
