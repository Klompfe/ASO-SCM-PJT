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
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockRuleRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
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
    getRepository: jest.fn().mockReturnValue(mockRuleRepository),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockDataSource.getRepository.mockReturnValue(mockRuleRepository);
    mockQueryRunnerManager.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));
    mockItemRepository.findOne.mockResolvedValue(null);
    mockItemRepository.find.mockResolvedValue([]);
    mockRuleRepository.findOne.mockResolvedValue(null);
    mockRuleRepository.find.mockResolvedValue([]);

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

  // PR-104: 화면에 입력란이 없어 죽어있던 type 선택/spec/description 필드를
  // 화면에 연결하면서, 백엔드가 이미 이 값들을 정상적으로 저장·수정하는지 확인한다
  // (백엔드 자체는 이번 PR에서 변경하지 않았지만, 실제로 동작하는지 회귀 검증).
  describe('create - type 값별 생성 (PR-104)', () => {
    it.each([ItemType.RAW_MATERIAL, ItemType.SEMI_FINISHED])(
      '%s 타입은 정상적으로 생성되어야 한다',
      async (type) => {
        const result = await service.create({ code: `TYPE_${type}`, name: `테스트 ${type}`, type });
        expect(result.type).toBe(type);
      },
    );

    it('FINISHED_GOOD 타입은 styleNo 없이도 정상 생성되어야 한다', async () => {
      const result = await service.create({ code: 'TYPE_FIN', name: '테스트 완제품', type: ItemType.FINISHED_GOOD });
      expect(result.type).toBe(ItemType.FINISHED_GOOD);
    });
  });

  describe('create/update - spec/description 저장 (PR-104)', () => {
    it('생성 시 spec/description을 지정하면 그대로 저장되어야 한다', async () => {
      const result = await service.create({
        code: 'SPEC_DESC_1',
        name: '테스트 품목',
        type: ItemType.RAW_MATERIAL,
        spec: '53"',
        description: '메모: 겉감용 폴리 원단',
      });

      expect(result.spec).toBe('53"');
      expect(result.description).toBe('메모: 겉감용 폴리 원단');
    });

    it('수정 시 spec/description을 바꾸면 정상 반영되어야 한다', async () => {
      const existing = { id: 7, code: 'SPEC_DESC_2', name: '기존 품목', type: ItemType.RAW_MATERIAL, spec: '', description: '' };
      mockItemRepository.findOne.mockResolvedValue(existing);
      mockItemRepository.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update(7, { spec: '65"', description: '수정된 설명' });

      expect(result.spec).toBe('65"');
      expect(result.description).toBe('수정된 설명');
      expect(mockItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ spec: '65"', description: '수정된 설명' }),
      );
    });
  });

  // PR-186: 실/테이프 종류(materialSubType) 지정 — 규칙 테이블에 없는 값은 400으로 거절한다(추측 저장 금지).
  describe('create/update - materialSubType 검증 (PR-186)', () => {
    it('규칙 테이블에 있는 materialSubType으로 생성하면 저장된다', async () => {
      mockRuleRepository.findOne.mockResolvedValue({ materialSubType: 'COA_SA', displayName: '코아사' });
      const result = await service.create({ code: 'SUB_1', name: '코아사 45S', type: ItemType.RAW_MATERIAL, materialSubType: 'COA_SA' });
      expect(result.materialSubType).toBe('COA_SA');
    });

    it('규칙 테이블에 없는 materialSubType으로 생성하면 BadRequestException', async () => {
      mockRuleRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({ code: 'SUB_2', name: '없는종류', type: ItemType.RAW_MATERIAL, materialSubType: 'NOT_EXIST' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('수정 시 materialSubType을 null로 보내면 해제된다(검증 없이)', async () => {
      const existing = { id: 8, code: 'SUB_3', name: '기존', type: ItemType.RAW_MATERIAL, materialSubType: 'COA_SA' };
      mockItemRepository.findOne.mockResolvedValue(existing);
      mockItemRepository.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update(8, { materialSubType: null });

      expect(result.materialSubType).toBeNull();
      expect(mockRuleRepository.findOne).not.toHaveBeenCalled();
    });

    it('수정 시 materialSubType을 생략하면(undefined) 기존 값이 유지된다', async () => {
      const existing = { id: 9, code: 'SUB_4', name: '기존', type: ItemType.RAW_MATERIAL, materialSubType: 'COA_SA' };
      mockItemRepository.findOne.mockResolvedValue(existing);
      mockItemRepository.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.update(9, { name: '이름만 변경' });

      expect(result.materialSubType).toBe('COA_SA');
    });
  });

  // PR-186 D: 실/테이프 후보 조회 — looksLikeThreadOrTape로 보수적으로 추려, 정확히 1개
  // 규칙과 매칭될 때만 추천값을 함께 준다(자동 확정 아님).
  describe('getThreadTapeCandidates (PR-186 D)', () => {
    const rules = [{ materialSubType: 'COA_SA', displayName: '코아사' }, { materialSubType: 'DADE', displayName: '다데' }];

    it('이름이 실/테이프로 보이는 자재만 후보로 추리고, 매칭 1개면 추천을 채운다', async () => {
      mockItemRepository.find.mockResolvedValue([
        { id: 1, code: 'M1', name: '코아사 45S', unit: 'EA', materialSubType: null, packagingReviewedAt: null },
        { id: 2, code: 'M2', name: '일반 원단', unit: 'M', materialSubType: null, packagingReviewedAt: null },
      ]);
      mockRuleRepository.find.mockResolvedValue(rules);

      const result = await service.getThreadTapeCandidates('false');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, name: '코아사 45S', suggestion: { materialSubType: 'COA_SA' } });
    });

    it('reviewed=true면 이미 검토된(종류 지정 또는 packagingReviewedAt 있는) 것만 보여준다', async () => {
      mockItemRepository.find.mockResolvedValue([
        { id: 1, code: 'M1', name: '코아사 45S', materialSubType: 'COA_SA', packagingReviewedAt: null },
        { id: 2, code: 'M2', name: '다데 테이프', materialSubType: null, packagingReviewedAt: null },
      ]);
      mockRuleRepository.find.mockResolvedValue(rules);

      const result = await service.getThreadTapeCandidates('true');

      expect(result.map((r) => r.id)).toEqual([1]);
    });

    it('reviewed=all이면 검토 여부와 무관하게 실/테이프로 보이는 전부를 보여준다', async () => {
      mockItemRepository.find.mockResolvedValue([
        { id: 1, code: 'M1', name: '코아사 45S', materialSubType: 'COA_SA', packagingReviewedAt: null },
        { id: 2, code: 'M2', name: '다데 테이프', materialSubType: null, packagingReviewedAt: null },
      ]);
      mockRuleRepository.find.mockResolvedValue(rules);

      const result = await service.getThreadTapeCandidates('all');

      expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
    });
  });

  // PR-186 D: 추천 확인 후 일괄 적용 — 하나라도 유효하지 않으면 전체 거절(all-or-nothing).
  describe('classifyThreadTape (PR-186 D)', () => {
    it('모두 유효하면 일괄 적용하고 packagingReviewedAt을 채운다', async () => {
      mockItemRepository.find.mockResolvedValue([
        { id: 1, code: 'M1', name: '코아사', materialSubType: null, packagingReviewedAt: null },
        { id: 2, code: 'M2', name: '일반자재', materialSubType: null, packagingReviewedAt: null },
      ]);
      mockRuleRepository.find.mockResolvedValue([{ materialSubType: 'COA_SA', displayName: '코아사' }]);

      const result = await service.classifyThreadTape([
        { itemId: 1, materialSubType: 'COA_SA' },
        { itemId: 2, materialSubType: null }, // "실/테이프 아님"으로 확정
      ]);

      expect(result).toEqual({ updated: 2 });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunnerManager.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, materialSubType: 'COA_SA' }));
      expect(mockQueryRunnerManager.save).toHaveBeenCalledWith(expect.objectContaining({ id: 2, materialSubType: null, packagingReviewedAt: expect.any(Date) }));
    });

    it('존재하지 않는 itemId가 하나라도 있으면 전부 거절(저장 시도 없음)', async () => {
      mockItemRepository.find.mockResolvedValue([{ id: 1, code: 'M1', name: '코아사', materialSubType: null, packagingReviewedAt: null }]);
      mockRuleRepository.find.mockResolvedValue([{ materialSubType: 'COA_SA', displayName: '코아사' }]);

      await expect(
        service.classifyThreadTape([
          { itemId: 1, materialSubType: 'COA_SA' },
          { itemId: 999, materialSubType: 'COA_SA' },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('존재하지 않는 종류가 하나라도 있으면 전부 거절', async () => {
      mockItemRepository.find.mockResolvedValue([{ id: 1, code: 'M1', name: '코아사', materialSubType: null, packagingReviewedAt: null }]);
      mockRuleRepository.find.mockResolvedValue([]); // COA_SA 규칙 없음

      await expect(service.classifyThreadTape([{ itemId: 1, materialSubType: 'COA_SA' }])).rejects.toThrow(BadRequestException);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('빈 배열이면 BadRequestException', async () => {
      await expect(service.classifyThreadTape([])).rejects.toThrow(BadRequestException);
    });
  });
});
