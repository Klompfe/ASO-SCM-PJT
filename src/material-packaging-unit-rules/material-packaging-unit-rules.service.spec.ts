import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaterialPackagingUnitRulesService } from './material-packaging-unit-rules.service';
import { MaterialPackagingUnitRule } from './entities/material-packaging-unit-rule.entity';

describe('MaterialPackagingUnitRulesService (PR-175)', () => {
  let service: MaterialPackagingUnitRulesService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository.find.mockResolvedValue([]);
    mockRepository.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialPackagingUnitRulesService,
        { provide: getRepositoryToken(MaterialPackagingUnitRule), useValue: mockRepository },
      ],
    }).compile();

    service = module.get(MaterialPackagingUnitRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllAsLengthMap', () => {
    it('규칙 목록을 materialSubType → unitLengthM(숫자) 맵으로 바꾼다', async () => {
      mockRepository.find.mockResolvedValue([
        { id: 1, materialSubType: 'COA_SA', unitLengthM: '2500' }, // pg decimal은 문자열로 올 수 있다
        { id: 2, materialSubType: 'DADE', unitLengthM: 50 },
      ]);
      const result = await service.findAllAsLengthMap();
      expect(result).toEqual({ COA_SA: 2500, DADE: 50 });
    });

    it('규칙이 없으면 빈 맵을 반환한다', async () => {
      mockRepository.find.mockResolvedValue([]);
      expect(await service.findAllAsLengthMap()).toEqual({});
    });
  });

  describe('create', () => {
    it('정상 등록된다', async () => {
      mockRepository.save.mockImplementation((r: any) => Promise.resolve({ id: 1, ...r }));
      const result = await service.create({
        materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500,
      } as any);
      expect(result).toEqual(expect.objectContaining({ materialSubType: 'COA_SA', unitLengthM: 2500 }));
    });

    it('이미 등록된 materialSubType이면 BadRequestException을 던진다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, materialSubType: 'COA_SA', displayName: '코아사' });
      await expect(
        service.create({ materialSubType: 'COA_SA', displayName: '코아사(중복)', packagingUnitLabel: '콘', unitLengthM: 2500 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('존재하지 않는 id면 NotFoundException', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.update(999, { unitLengthM: 100 } as any)).rejects.toThrow(NotFoundException);
    });

    it('unitLengthM만 바꾸면(materialSubType 생략) 중복 검사를 하지 않는다', async () => {
      mockRepository.findOne.mockResolvedValueOnce({ id: 1, materialSubType: 'COA_SA', unitLengthM: 2500 });
      mockRepository.save.mockImplementation((r: any) => Promise.resolve(r));
      const result = await service.update(1, { unitLengthM: 2600 } as any);
      expect(result.unitLengthM).toBe(2600);
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1); // findOneOrFail만 호출, 중복검사 findOne은 안 탐
    });

    it('materialSubType을 다른 값으로 바꾸고 그 값이 이미 있으면 BadRequestException', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce({ id: 1, materialSubType: 'COA_SA' }) // findOneOrFail
        .mockResolvedValueOnce({ id: 2, materialSubType: 'DADE', displayName: '다데' }); // assertNoDuplicate
      await expect(service.update(1, { materialSubType: 'DADE' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('존재하지 않는 id면 NotFoundException', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('정상 삭제된다', async () => {
      const rule = { id: 1, materialSubType: 'COA_SA' };
      mockRepository.findOne.mockResolvedValue(rule);
      await service.remove(1);
      expect(mockRepository.remove).toHaveBeenCalledWith(rule);
    });
  });
});
