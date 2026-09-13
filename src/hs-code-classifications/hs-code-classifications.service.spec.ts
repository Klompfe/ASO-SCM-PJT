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
            create: jest.fn((v) => v),
            save: jest.fn(),
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
});
