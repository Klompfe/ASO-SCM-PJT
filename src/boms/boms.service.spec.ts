import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BomsService } from './boms.service';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { Item } from '../items/entities/item.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
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
        { provide: getRepositoryToken(PurchaseOrder), useValue: { count: jest.fn() } },
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
        { provide: getRepositoryToken(PurchaseOrder), useValue: { count: jest.fn() } },
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

// PR-197: 저장된 BOM 행 삭제·자재 교체·요척(소요량)/규격/색상/구분 수정 — 실제 사례
// (자재명세 엑셀 요척 2.9가 BOM에는 2.7로 저장돼 필요량이 틀렸던 건)의 회귀 테스트.
describe('BomsService.updateItem/deleteItem/swapMaterial (PR-197)', () => {
  let service: BomsService;
  let bomItemRepository: Repository<BomItem>;
  let itemRepository: Repository<Item>;
  let purchaseOrderRepository: Repository<PurchaseOrder>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(Bom), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BomItem), useValue: { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)), delete: jest.fn() } },
        { provide: getRepositoryToken(Item), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PurchaseOrder), useValue: { count: jest.fn() } },
      ],
    }).compile();
    service = module.get(BomsService);
    bomItemRepository = module.get(getRepositoryToken(BomItem));
    itemRepository = module.get(getRepositoryToken(Item));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
  });

  describe('updateItem', () => {
    const buildBomItem = (overrides: Partial<BomItem> = {}): BomItem =>
      ({
        id: 10, composition: null, hsCode: null, threadType: null, tapeType: null,
        consumption: 2.7, spec: '53"', colorCode: 'BK', category: '부자재', requiredQty: 2646,
        material: { id: 1, name: '다데<실크>' },
        bom: { id: 1, style: { styleNo: 'ST-1', overview: { totalQty: 980 } } },
        ...overrides,
      }) as unknown as BomItem;

    it('요척(consumption)을 수정하면 requiredQty가 "요척 × 스타일 총수량"으로 재계산된다(2.9 × 980 = 2,842 회귀 케이스)', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(buildBomItem());
      const result = await service.updateItem(10, { consumption: 2.9 });
      expect(Number(result.consumption)).toBe(2.9);
      expect(Number(result.requiredQty)).toBe(2842);
      expect(result.before).toMatchObject({ consumption: 2.7, requiredQty: 2646 });
    });

    it('스타일 총수량이 없으면(StyleOverview 미등록) requiredQty는 건드리지 않는다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(
        buildBomItem({ bom: { id: 1, style: { styleNo: 'ST-2', overview: null } } } as any),
      );
      const result = await service.updateItem(10, { consumption: 3 });
      expect(Number(result.consumption)).toBe(3);
      expect(Number(result.requiredQty)).toBe(2646); // 그대로
    });

    it('일부 필드만 보내면 나머지 필드는 그대로다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(buildBomItem());
      const result = await service.updateItem(10, { spec: '54"' });
      expect(result.spec).toBe('54"');
      expect(Number(result.consumption)).toBe(2.7); // 안 바뀜
      expect(result.colorCode).toBe('BK'); // 안 바뀜
    });

    it('존재하지 않는 id면 404', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.updateItem(999, { spec: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteItem', () => {
    it('정상 삭제되고, Item(자재 마스터)은 건드리지 않으며, 같은 스타일 연결 발주(취소 제외) 건수를 함께 돌려준다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 10, material: { id: 1 }, bom: { style: { styleNo: 'ST-1' } },
      } as any);
      (purchaseOrderRepository.count as jest.Mock).mockResolvedValue(2);

      const result = await service.deleteItem(10);

      expect(result).toEqual({ deletedId: 10, linkedPurchaseOrderCount: 2 });
      expect(bomItemRepository.delete).toHaveBeenCalledWith(10);
      expect(itemRepository.findOne).not.toHaveBeenCalled(); // Item(자재 마스터)은 건드리지 않는다
    });

    it('존재하지 않는 id면 404', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.deleteItem(999)).rejects.toThrow(NotFoundException);
      expect(bomItemRepository.delete).not.toHaveBeenCalled();
    });

    it('연결된 발주가 없어도(0건) 삭제는 그대로 진행된다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue({
        id: 10, material: { id: 1 }, bom: { style: { styleNo: 'ST-1' } },
      } as any);
      (purchaseOrderRepository.count as jest.Mock).mockResolvedValue(0);
      const result = await service.deleteItem(10);
      expect(result.linkedPurchaseOrderCount).toBe(0);
      expect(bomItemRepository.delete).toHaveBeenCalledWith(10);
    });
  });

  describe('swapMaterial', () => {
    it('materialId로 이미 있는 자재로 교체한다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue({ id: 10, material: { id: 1, name: '스판사' } } as any);
      (itemRepository.findOne as jest.Mock).mockResolvedValue({ id: 2, name: '스쿠이사' });

      const result = await service.swapMaterial(10, { materialId: 2 });

      expect(result.material).toEqual({ id: 2, name: '스쿠이사' });
    });

    it('materialName으로도 교체할 수 있다(이미 등록된 이름만)', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue({ id: 10, material: { id: 1, name: '스판사' } } as any);
      (itemRepository.findOne as jest.Mock).mockResolvedValue({ id: 2, name: '스쿠이사' });

      await service.swapMaterial(10, { materialName: '스쿠이사' });

      expect(itemRepository.findOne).toHaveBeenCalledWith({ where: { name: '스쿠이사' } });
    });

    it('존재하지 않는 자재(id/이름 둘 다 못 찾음)는 400 — 새로 만들지 않는다', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue({ id: 10, material: { id: 1 } } as any);
      (itemRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.swapMaterial(10, { materialName: '없는자재' })).rejects.toThrow(BadRequestException);
    });

    it('존재하지 않는 BomItem id면 404', async () => {
      (bomItemRepository.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.swapMaterial(999, { materialId: 1 })).rejects.toThrow(NotFoundException);
    });
  });
});
