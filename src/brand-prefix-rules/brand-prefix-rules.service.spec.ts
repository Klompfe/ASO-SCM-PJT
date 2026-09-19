import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrandPrefixRulesService } from './brand-prefix-rules.service';
import { BrandPrefixRule } from './entities/brand-prefix-rule.entity';

describe('BrandPrefixRulesService', () => {
  let service: BrandPrefixRulesService;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandPrefixRulesService,
        { provide: getRepositoryToken(BrandPrefixRule), useValue: mockRepository },
      ],
    }).compile();

    service = module.get(BrandPrefixRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('접두사 규칙을 정상 생성하고 대문자로 정규화한다', async () => {
      mockRepository.save.mockImplementation((r: any) => Promise.resolve({ id: 1, ...r }));

      const result = await service.create({ prefix: 'bf', brandName: '빈폴' } as any);

      expect(result).toMatchObject({ prefix: 'BF', isNumericStart: false, brandName: '빈폴' });
    });

    it('숫자시작 규칙을 생성하면 prefix가 null로 저장된다', async () => {
      mockRepository.save.mockImplementation((r: any) => Promise.resolve({ id: 1, ...r }));

      const result = await service.create({ isNumericStart: true, brandName: '에잇세컨즈' } as any);

      expect(result).toMatchObject({ prefix: null, isNumericStart: true, brandName: '에잇세컨즈' });
    });

    it('이미 등록된 접두사(대소문자 무시)면 400이다', async () => {
      mockRepository.find.mockResolvedValue([{ id: 5, prefix: 'BF', isNumericStart: false, brandName: '빈폴' }]);

      await expect(service.create({ prefix: 'bf', brandName: '다른브랜드' } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('숫자시작 규칙이 이미 있으면 또 등록 시 400이다', async () => {
      mockRepository.find.mockResolvedValue([{ id: 5, prefix: null, isNumericStart: true, brandName: '에잇세컨즈' }]);

      await expect(
        service.create({ isNumericStart: true, brandName: '다른브랜드' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('서로 다른 접두사면 정상 등록된다', async () => {
      mockRepository.find.mockResolvedValue([{ id: 5, prefix: 'BF', isNumericStart: false, brandName: '빈폴' }]);
      mockRepository.save.mockImplementation((r: any) => Promise.resolve({ id: 2, ...r }));

      const result = await service.create({ prefix: 'MB', brandName: '미센스' } as any);
      expect(result.prefix).toBe('MB');
    });
  });

  describe('update', () => {
    it('존재하지 않는 id면 404다', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.update(999, { brandName: 'X' } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('note만 수정해도 prefix/isNumericStart는 기존 값이 유지된다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, prefix: 'BF', isNumericStart: false, brandName: '빈폴', note: null });
      mockRepository.save.mockImplementation((r: any) => Promise.resolve(r));

      const result = await service.update(1, { note: '메모 추가' } as any);
      expect(result).toMatchObject({ prefix: 'BF', isNumericStart: false, brandName: '빈폴', note: '메모 추가' });
    });

    it('isNumericStart를 true로 바꾸면 prefix가 null로 지워진다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, prefix: 'BF', isNumericStart: false, brandName: '빈폴' });
      mockRepository.save.mockImplementation((r: any) => Promise.resolve(r));

      const result = await service.update(1, { isNumericStart: true } as any);
      expect(result.prefix).toBeNull();
      expect(result.isNumericStart).toBe(true);
    });

    it('수정한 prefix가 다른 규칙과 충돌하면 400이다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, prefix: 'BF', isNumericStart: false, brandName: '빈폴' });
      mockRepository.find.mockResolvedValue([
        { id: 1, prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
        { id: 2, prefix: 'MB', isNumericStart: false, brandName: '미센스' },
      ]);

      await expect(service.update(1, { prefix: 'MB' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('존재하지 않는 id면 404다', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('존재하면 정상 삭제된다', async () => {
      const existing = { id: 1, prefix: 'BF', brandName: '빈폴' };
      mockRepository.findOne.mockResolvedValue(existing);

      await service.remove(1);
      expect(mockRepository.remove).toHaveBeenCalledWith(existing);
    });
  });
});
