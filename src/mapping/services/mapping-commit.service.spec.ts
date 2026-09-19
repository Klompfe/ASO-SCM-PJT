import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MappingCommitService } from './mapping-commit.service';
import { StyleOverviewStatus } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile } from '../../imports/entities/import-file.entity';
import { Item } from '../../items/entities/item.entity';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { CommitMappingDto } from '../dto/commit-mapping.dto';

describe('MappingCommitService', () => {
  let service: MappingCommitService;

  const mockQueryRunnerManager = {
    findOne: jest.fn(),
    save: jest.fn((_entity: any, data: any) => Promise.resolve(data)),
    create: jest.fn((_entity: any, data: any) => data),
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

  const validPayload: CommitMappingDto = {
    styleNo: 'MB62SLM103Z',
    overviewData: {
      styleNo: 'MB62SLM103Z',
      totalQty: 700,
      factory: '베트남',
      buyer: '미도컴퍼니',
      shipDate: '',
    },
    bomItems: [
      { id: 1, category: 'GENERAL', itemName: 'POLY BAG', consumption: 1, requiredQty: 700, colorOf: 'FREE', spec: '' },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunnerManager.save.mockImplementation((_entity: any, data: any) => Promise.resolve(data));
    mockQueryRunnerManager.create.mockImplementation((_entity: any, data: any) => data);
    mockQueryRunnerManager.findOne.mockResolvedValue(null);

    service = new MappingCommitService(mockDataSource as unknown as DataSource);
  });

  describe('commit (성공 케이스)', () => {
    it('overviewData.shipDate를 StyleOverview.firstShipDate로 매핑하고 status 기본값을 채워 저장해야 한다', async () => {
      const result = await service.commit(validPayload);

      expect(result).toEqual({ success: true, styleNo: 'MB62SLM103Z', warnings: [] });

      // MasterStyle은 queryRunner.manager.save(style)처럼 단일 엔티티 인스턴스로 저장되므로
      // (엔티티 클래스, data) 2-인자 형태가 아니라 overview 속성을 가진 인자로 찾는다.
      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave).toBeDefined();
      expect(styleSave[0].overview).toEqual(
        expect.objectContaining({
          factory: '베트남',
          totalQty: 700,
          buyer: '미도컴퍼니',
          firstShipDate: null, // shipDate가 빈 문자열이면 null (더 이상 존재하지 않는 shipDate 필드로 저장 시도하지 않음)
          status: StyleOverviewStatus.PENDING_APPROVAL,
        }),
      );
      // 백엔드 payload에는 shipDate라는 필드명이 있지만 엔티티 컬럼명(firstShipDate)으로 저장되어야 하므로,
      // 잘못된 이름(shipDate)으로는 저장되지 않아야 한다.
      expect(styleSave[0].overview).not.toHaveProperty('shipDate');

      // Bom도 queryRunner.manager.save(bom)처럼 단일 엔티티 인스턴스로 저장된다.
      const bomSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.bomNo,
      );
      expect(bomSave).toBeDefined();

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1]).toEqual(
        expect.objectContaining({ category: 'GENERAL', consumption: 1, requiredQty: 700 }),
      );

      const importFileSave = mockQueryRunnerManager.save.mock.calls.find(
        ([entity]: any) => entity === ImportFile,
      );
      expect(importFileSave).toBeDefined();

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('shipDate 값이 실제로 있으면 firstShipDate에 Date로 변환되어 저장되어야 한다', async () => {
      await service.commit({
        ...validPayload,
        overviewData: { ...validPayload.overviewData, shipDate: '2026-03-01' },
      });

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.firstShipDate).toEqual(new Date('2026-03-01'));
    });

    it('기존 자재(Item)가 이미 있으면 재생성하지 않고 재사용해야 한다', async () => {
      const existingMaterial = { id: 42, name: 'POLY BAG' };
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === Item) return Promise.resolve(existingMaterial);
        return Promise.resolve(null);
      });

      await service.commit(validPayload);

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave).toBeUndefined(); // 신규 생성 안 함

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].material).toEqual(existingMaterial);
    });
  });

  describe('CommitMappingDto 유효성 검증 (필수 필드 누락 시 명확한 검증 에러)', () => {
    it('overviewData가 아예 없으면 validation error가 발생해야 한다 (더 이상 500+SQLITE_CONSTRAINT로 이어지지 않음)', async () => {
      const dto = plainToInstance(CommitMappingDto, { styleNo: 'MB62SLM103Z', bomItems: [] });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'overviewData')).toBe(true);
    });

    it('overviewData.factory/buyer/totalQty가 없으면 validation error가 발생해야 한다', async () => {
      const dto = plainToInstance(CommitMappingDto, {
        styleNo: 'MB62SLM103Z',
        overviewData: { styleNo: 'MB62SLM103Z' },
        bomItems: [],
      });
      const errors = await validate(dto);
      const overviewErrors = errors.find((e) => e.property === 'overviewData');
      expect(overviewErrors).toBeDefined();
      const childProps = (overviewErrors?.children || []).map((c) => c.property);
      expect(childProps).toEqual(expect.arrayContaining(['factory', 'totalQty', 'buyer']));
    });

    it('bomItems 항목에 itemName이 없으면 validation error가 발생해야 한다', async () => {
      const dto = plainToInstance(CommitMappingDto, {
        styleNo: 'MB62SLM103Z',
        overviewData: validPayload.overviewData,
        bomItems: [{ category: 'GENERAL' }],
      });
      const errors = await validate(dto);
      const bomItemsErrors = errors.find((e) => e.property === 'bomItems');
      expect(bomItemsErrors).toBeDefined();
    });

    it('정상 payload는 validation error가 없어야 한다', async () => {
      const dto = plainToInstance(CommitMappingDto, validPayload);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // PR-098: 같은 styleNo로 재커밋될 때 기존 StyleOverview/Bom을 통째로 교체·중복
  // 생성하지 않고 병합하는지 검증한다. LB6YSLM107Z(기존 BK 컬러 215장 + 신규 CR/BR
  // 컬러 추가) 실사례를 그대로 재현한다.
  describe('commit (병합 — 같은 styleNo 재커밋)', () => {
    const existingBomItem: BomItem = {
      id: 501,
      bom: undefined as any,
      material: { id: 10, name: '원단' } as any,
      category: 'FABRIC',
      colorCode: 'BK',
      spec: 'N/A',
      consumption: 1 as any,
      requiredQty: 215 as any,
      supplier: null,
      unitPrice: 0 as any,
      remarks: 'N/A',
      composition: null,
      hsCode: null,
    };
    const existingBom: Bom = {
      id: 77,
      bomNo: 'BOM-LB6YSLM107Z-001',
      version: 'V1',
      isActive: true,
      style: undefined as any,
      items: [existingBomItem],
    };
    const existingOverview = {
      id: 88,
      factory: '베트남',
      totalQty: 215,
      buyer: '미도컴퍼니',
      firstShipDate: null,
      status: StyleOverviewStatus.PENDING_APPROVAL,
      brand: null,
      itemType: null,
      productionType: null,
      targetRdd: null,
      cmtPrice: null,
      fobPrice: null,
      styleName: null,
      style: undefined as any,
    };
    const existingStyle: MasterStyle = { styleNo: 'LB6YSLM107Z', overview: existingOverview as any, boms: [] };

    const rebuildPayload = (): CommitMappingDto => ({
      styleNo: 'LB6YSLM107Z',
      overviewData: {
        styleNo: 'LB6YSLM107Z',
        totalQty: 430,
        factory: '삼정', // 기존 '베트남'과 충돌하는 값 — 자동 반영되면 안 됨.
        buyer: '미도컴퍼니',
        shipDate: '',
      },
      bomItems: [
        // 기존과 완전히 동일한 (자재명, 색상, 규격) — 건드리면 안 됨.
        { itemName: '원단', category: 'FABRIC', colorCode: 'BK', spec: '', consumption: 1, requiredQty: 215 },
        // 신규 컬러 — 새로 추가되어야 함.
        { itemName: '원단', category: 'FABRIC', colorCode: 'CR', spec: '', consumption: 1, requiredQty: 215 },
      ],
    });

    beforeEach(() => {
      mockQueryRunnerManager.findOne.mockImplementation((entity: any, options?: any) => {
        if (entity === MasterStyle) return Promise.resolve({ ...existingStyle, overview: { ...existingOverview } });
        if (entity === Bom) return Promise.resolve({ ...existingBom, items: [{ ...existingBomItem }] });
        if (entity === Item) return Promise.resolve({ id: 10, name: '원단' });
        return Promise.resolve(null);
      });
    });

    it('(a) 기존 BomItem은 그대로 유지되고 수정 저장되지 않는다', async () => {
      await service.commit(rebuildPayload());

      const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      // 기존 BK 항목에 대한 save 호출이 없어야 한다(새 CR 항목 1건만 저장됨).
      expect(bomItemSaveCalls.some(([, data]: any) => data.colorCode === 'BK')).toBe(false);
    });

    it('(b) 신규 컬러 조합만 새 BomItem으로 추가된다', async () => {
      await service.commit(rebuildPayload());

      const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      expect(bomItemSaveCalls).toHaveLength(1);
      expect(bomItemSaveCalls[0][1]).toEqual(
        expect.objectContaining({ colorCode: 'CR', requiredQty: 215 }),
      );
    });

    it('(c) 기존 factory 값이 있으면 자동으로 바뀌지 않고 warnings에 기록된다', async () => {
      const result = await service.commit(rebuildPayload());

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.factory).toBe('베트남');
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("기존 factory 값 '베트남' → 새 값 '삼정'")]),
      );
    });

    it('(d) Bom이 이미 있으면 재사용하고 새로 생성하지 않는다', async () => {
      await service.commit(rebuildPayload());

      const bomCreateOrSave = mockQueryRunnerManager.save.mock.calls.some(
        ([arg]: any) => arg && typeof arg === 'object' && 'bomNo' in arg,
      );
      expect(bomCreateOrSave).toBe(false);
    });

    it('기존 BomItem과 요척/소요량이 다르면 자동 반영하지 않고 warnings에 차이를 기록한다', async () => {
      const payload = rebuildPayload();
      payload.bomItems[0].requiredQty = 999; // 기존 215와 다른 값

      const result = await service.commit(payload);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('원단(BK/N/A)')]),
      );
      const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      expect(bomItemSaveCalls.some(([, data]: any) => data.colorCode === 'BK')).toBe(false);
    });

    it('totalQty가 값을 보내면 새 값으로 갱신된다(factory와 달리 예외 없음)', async () => {
      await service.commit(rebuildPayload());

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.totalQty).toBe(430);
    });
  });

  // PR-100: 안감(조바)류인데 혼용률(composition)이 비어있으면 관례상 기본값
  // "POLYESTER 100%"를 자동으로 채워야 한다(MB72BLM102Z_TEMP 실사례 재현).
  describe('commit (안감류 혼용률 기본값 자동 적용 — PR-100)', () => {
    const basePayload: CommitMappingDto = {
      styleNo: 'MB72BLM102Z_TEMP',
      overviewData: {
        styleNo: 'MB72BLM102Z_TEMP',
        totalQty: 100,
        factory: '베트남',
        buyer: '미도컴퍼니',
        shipDate: '',
      },
      bomItems: [],
    };

    beforeEach(() => {
      // 이 describe 블록은 항상 "완전히 새로운 스타일/BOM/자재"를 가정한다(브랜드
      // 신규 커밋 경로) — 상위 describe의 기본 mock(findOne -> null)을 그대로 쓴다.
      mockQueryRunnerManager.findOne.mockResolvedValue(null);
    });

    it('category가 "안감"이고 composition이 없으면 기본값이 채워지고 warnings에 기록된다', async () => {
      const result = await service.commit({
        ...basePayload,
        bomItems: [{ itemName: '안감원단', category: '안감', consumption: 1, requiredQty: 100 }],
      });

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].composition).toBe('POLYESTER 100%');
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("안감 항목 '안감원단' 혼용률 미기재 — 기본값 POLYESTER 100% 자동 적용")]),
      );
    });

    it('itemName에 "조바"가 포함되면(category는 다른 값이어도) 기본값이 채워진다', async () => {
      await service.commit({
        ...basePayload,
        bomItems: [{ itemName: '조바천', category: 'FABRIC', consumption: 1, requiredQty: 100 }],
      });

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].composition).toBe('POLYESTER 100%');
    });

    it('안감 항목인데 이미 composition이 있으면 덮어쓰지 않는다', async () => {
      const result = await service.commit({
        ...basePayload,
        bomItems: [
          { itemName: '안감원단', category: '안감', consumption: 1, requiredQty: 100, composition: 'NYLON 100%' },
        ],
      });

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].composition).toBe('NYLON 100%');
      expect(result.warnings).toHaveLength(0);
    });

    it('안감이 아닌 항목(겉감/부자재)은 composition이 없어도 기본값을 적용하지 않는다', async () => {
      const result = await service.commit({
        ...basePayload,
        bomItems: [
          { itemName: '겉감원단', category: 'FABRIC', consumption: 1, requiredQty: 100 },
          { itemName: 'ZIPPER', category: 'TRIM', consumption: 1, requiredQty: 100 },
        ],
      });

      const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      expect(bomItemSaveCalls.every(([, data]: any) => data.composition === null)).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('겉감(FABRIC)에 실제 혼용률이 기재되어 있으면 그 값이 그대로 저장되고 안감 기본값 로직이 개입하지 않는다', async () => {
      await service.commit({
        ...basePayload,
        bomItems: [
          { itemName: '겉감원단', category: 'FABRIC', consumption: 1, requiredQty: 100, composition: 'WOOL 98%, POLYURETHANE 2%' },
        ],
      });

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].composition).toBe('WOOL 98%, POLYURETHANE 2%');
    });
  });
});
