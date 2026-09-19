import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BomsService } from './boms.service';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { Item } from '../items/entities/item.entity';
import { LABEL_SET } from './label-set.constants';

// PR-099: "라벨류 기본 세트 추가" — 이미 등록된 항목은 건너뛰고, 없는 것만 새로
// 추가되는지 검증한다.
describe('BomsService.addLabelSet (PR-099)', () => {
  let service: BomsService;
  let bomRepository: Repository<Bom>;
  let bomItemRepository: Repository<BomItem>;
  let itemRepository: Repository<Item>;

  const buildBom = (existingItems: Partial<BomItem>[]): Bom =>
    ({ id: 1, bomNo: 'BOM-STYLE-001', version: 'V1', style: undefined, items: existingItems as BomItem[] }) as Bom;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(Bom), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BomItem), useValue: { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) } },
        { provide: getRepositoryToken(Item), useValue: { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) } },
      ],
    }).compile();

    service = module.get(BomsService);
    bomRepository = module.get(getRepositoryToken(Bom));
    bomItemRepository = module.get(getRepositoryToken(BomItem));
    itemRepository = module.get(getRepositoryToken(Item));
  });

  it('BOM에 라벨류 항목이 하나도 없으면 7개 전부 추가된다', async () => {
    (bomRepository.find as jest.Mock).mockResolvedValue([buildBom([])]);
    (itemRepository.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(7);
    expect(result.skipped).toHaveLength(0);
    expect(bomItemRepository.save).toHaveBeenCalledTimes(7);
  });

  it('이미 MAIN+SIZE LABEL이 있으면 그 항목만 건너뛰고 6개만 추가된다', async () => {
    (bomRepository.find as jest.Mock).mockResolvedValue([
      buildBom([{ material: { id: 99, name: 'MAIN+SIZE LABEL' } as any }]),
    ]);
    (itemRepository.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(6);
    expect(result.skipped).toEqual(['MAIN+SIZE LABEL']);
    expect(bomItemRepository.save).toHaveBeenCalledTimes(6);
    expect((bomItemRepository.save as jest.Mock).mock.calls.some(([data]: any) => data.category === '라벨' && data.material === null)).toBe(false);
  });

  it('전부 이미 있으면 하나도 추가하지 않는다', async () => {
    const existingItems = LABEL_SET.map((l) => ({ material: { id: 1, name: l.itemName } as any }));
    (bomRepository.find as jest.Mock).mockResolvedValue([buildBom(existingItems)]);

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(7);
    expect(bomItemRepository.save).not.toHaveBeenCalled();
  });

  it('기존 자재(Item)가 이미 있으면 재생성하지 않고 재사용한다', async () => {
    (bomRepository.find as jest.Mock).mockResolvedValue([buildBom([])]);
    const existingMaterial = { id: 42, name: 'POLY BAG' };
    (itemRepository.findOne as jest.Mock).mockImplementation((opts: any) =>
      opts.where.name === 'POLY BAG' ? Promise.resolve(existingMaterial) : Promise.resolve(null),
    );

    await service.addLabelSet('STYLE-A');

    expect(itemRepository.save).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'POLY BAG' }));
    const polyBagBomItem = (bomItemRepository.save as jest.Mock).mock.calls.find(
      ([data]: any) => data.category === '포장',
    );
    expect(polyBagBomItem[0].material).toEqual(existingMaterial);
  });

  it('스타일에 BOM 자체가 없으면 NotFoundException을 던진다', async () => {
    (bomRepository.find as jest.Mock).mockResolvedValue([]);

    await expect(service.addLabelSet('NO-SUCH-STYLE')).rejects.toThrow(NotFoundException);
  });
});

// PR-123: BOM 조회 화면(GET /boms?styleNo=)과 라벨 세트 추가가 "최고 id"가 아니라 pickActiveBom 규칙으로 BOM을 고른다.
describe('BomsService.findActiveByStyleNo (PR-123)', () => {
  let service: BomsService;
  let bomRepository: Repository<Bom>;
  let bomItemRepository: Repository<BomItem>;

  const bom = (id: number, isActive: boolean | undefined, items: Partial<BomItem>[] = []): Bom =>
    ({ id, bomNo: 'BOM-X-001', version: 'V1', ...(isActive === undefined ? {} : { isActive }), style: undefined, items: items as BomItem[] }) as unknown as Bom;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(Bom), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BomItem), useValue: { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) } },
        { provide: getRepositoryToken(Item), useValue: { findOne: jest.fn().mockResolvedValue(null), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) } },
      ],
    }).compile();
    service = module.get(BomsService);
    bomRepository = module.get(getRepositoryToken(Bom));
    bomItemRepository = module.get(getRepositoryToken(BomItem));
  });

  const given = (boms: Bom[]) => (bomRepository.find as jest.Mock).mockResolvedValue(boms);

  it('isActive가 있으면 id가 더 큰 비활성 BOM이 아니라 활성 BOM을 돌려준다(사용자가 예전 BOM을 선택한 경우)', async () => {
    given([bom(5, true), bom(116, false)]);
    expect((await service.findActiveByStyleNo('MB72BLM102Z'))!.id).toBe(5);
  });

  it('활성이 최신(id 최대)이면 기존 동작과 같은 결과', async () => {
    given([bom(5, false), bom(116, true)]);
    expect((await service.findActiveByStyleNo('MB72BLM102Z'))!.id).toBe(116);
  });

  it('isActive 값이 없는 데이터는 이전 규칙(가장 큰 id)과 같은 결과', async () => {
    given([bom(12, undefined), bom(51, undefined), bom(30, undefined)]);
    expect((await service.findActiveByStyleNo('X'))!.id).toBe(51);
  });

  it('전부 비활성인 비정상 상태도 가장 큰 id로 대체(BOM 없음으로 오인하지 않는다)', async () => {
    given([bom(3, false), bom(9, false)]);
    expect((await service.findActiveByStyleNo('X'))!.id).toBe(9);
  });

  it('활성이 여러 건이면 그중 최신, BOM이 없으면 null', async () => {
    given([bom(1, true), bom(7, false), bom(4, true)]);
    expect((await service.findActiveByStyleNo('X'))!.id).toBe(4);
    given([]);
    expect(await service.findActiveByStyleNo('X')).toBeNull();
  });

  it('BOM 자재/스타일 관계를 함께 조회한다(화면이 그대로 쓰는 응답 형태 유지)', async () => {
    given([bom(1, true)]);
    await service.findActiveByStyleNo('STYLE-A');
    expect(bomRepository.find).toHaveBeenCalledWith({ where: { style: { styleNo: 'STYLE-A' } }, relations: ['items', 'items.material', 'style'], order: { items: { id: 'ASC' } } });
  });

  it('라벨 세트 추가는 활성 BOM에 붙는다(화면에 보이는 BOM과 같은 BOM)', async () => {
    given([bom(5, true, []), bom(116, false, [])]);
    await service.addLabelSet('STYLE-A');
    const savedBoms = (bomItemRepository.save as jest.Mock).mock.calls.map(([data]: any) => data.bom.id);
    expect(savedBoms.length).toBe(7);
    expect(new Set(savedBoms)).toEqual(new Set([5]));
  });
});
