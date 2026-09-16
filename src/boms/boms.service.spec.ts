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
        { provide: getRepositoryToken(Bom), useValue: { findOne: jest.fn() } },
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
    (bomRepository.findOne as jest.Mock).mockResolvedValue(buildBom([]));
    (itemRepository.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(7);
    expect(result.skipped).toHaveLength(0);
    expect(bomItemRepository.save).toHaveBeenCalledTimes(7);
  });

  it('이미 MAIN+SIZE LABEL이 있으면 그 항목만 건너뛰고 6개만 추가된다', async () => {
    (bomRepository.findOne as jest.Mock).mockResolvedValue(
      buildBom([{ material: { id: 99, name: 'MAIN+SIZE LABEL' } as any }]),
    );
    (itemRepository.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(6);
    expect(result.skipped).toEqual(['MAIN+SIZE LABEL']);
    expect(bomItemRepository.save).toHaveBeenCalledTimes(6);
    expect((bomItemRepository.save as jest.Mock).mock.calls.some(([data]: any) => data.category === '라벨' && data.material === null)).toBe(false);
  });

  it('전부 이미 있으면 하나도 추가하지 않는다', async () => {
    const existingItems = LABEL_SET.map((l) => ({ material: { id: 1, name: l.itemName } as any }));
    (bomRepository.findOne as jest.Mock).mockResolvedValue(buildBom(existingItems));

    const result = await service.addLabelSet('STYLE-A');

    expect(result.added).toHaveLength(0);
    expect(result.skipped).toHaveLength(7);
    expect(bomItemRepository.save).not.toHaveBeenCalled();
  });

  it('기존 자재(Item)가 이미 있으면 재생성하지 않고 재사용한다', async () => {
    (bomRepository.findOne as jest.Mock).mockResolvedValue(buildBom([]));
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
    (bomRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.addLabelSet('NO-SUCH-STYLE')).rejects.toThrow(NotFoundException);
  });
});
