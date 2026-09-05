import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { Item, ItemType } from './entities/item.entity';

describe('ItemsService', () => {
  let service: ItemsService;
  let itemRepository: Repository<Item>;

  const mockItemRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockQueryRunnerManager = {
    save: jest.fn((entity: any) => Promise.resolve({ id: 1, ...entity })),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockQueryRunnerManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunnerManager.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));
    mockItemRepository.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useValue: mockItemRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    itemRepository = module.get<Repository<Item>>(getRepositoryToken(Item));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create - styleNo 저장 (회귀: PR-034)', () => {
    it('FINISHED_GOOD 생성 시 styleNo가 실제로 저장되어야 한다', async () => {
      const result = await service.create({
        code: 'FIN_STYLE_1',
        name: '테스트 완제품',
        type: ItemType.FINISHED_GOOD,
        styleNo: 'MB62SLM103Z',
      });

      expect(result.styleNo).toBe('MB62SLM103Z');
      expect(mockQueryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ styleNo: 'MB62SLM103Z' }),
      );
    });

    it('RAW_MATERIAL에 styleNo를 지정하면 400이어야 한다', async () => {
      await expect(
        service.create({
          code: 'RAW_STYLE_1',
          name: '테스트 원자재',
          type: ItemType.RAW_MATERIAL,
          styleNo: 'MB62SLM103Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('styleNo 없이 생성하면 정상 동작해야 한다(하위 호환)', async () => {
      const result = await service.create({
        code: 'FIN_NO_STYLE',
        name: '스타일 없는 완제품',
        type: ItemType.FINISHED_GOOD,
      });

      expect(result.styleNo).toBeUndefined();
    });
  });

  describe('update - styleNo 저장 (회귀: PR-034)', () => {
    it('FINISHED_GOOD 품목의 styleNo를 수정하면 정상 반영되어야 한다', async () => {
      const existing = { id: 5, code: 'FIN_1', name: '완제품', type: ItemType.FINISHED_GOOD, styleNo: undefined };
      mockItemRepository.findOne.mockResolvedValue(existing);
      mockItemRepository.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update(5, { styleNo: 'MB6YSLM115Z' });

      expect(result.styleNo).toBe('MB6YSLM115Z');
      expect(mockItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ styleNo: 'MB6YSLM115Z' }),
      );
    });

    it('RAW_MATERIAL 품목에 styleNo를 수정하려 하면 400이어야 한다', async () => {
      const existing = { id: 6, code: 'RAW_1', name: '원자재', type: ItemType.RAW_MATERIAL };
      mockItemRepository.findOne.mockResolvedValue(existing);

      await expect(service.update(6, { styleNo: 'MB6YSLM115Z' })).rejects.toBeInstanceOf(BadRequestException);
      expect(mockItemRepository.save).not.toHaveBeenCalled();
    });
  });
});
