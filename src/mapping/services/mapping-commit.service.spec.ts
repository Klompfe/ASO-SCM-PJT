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
import { PurchaseOrder, PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { CommitMappingDto } from '../dto/commit-mapping.dto';
import { AiBomItemDto } from '../../sales-orders/dto/ai-analysis.dto';
import { BomDiffRequestDto } from '../dto/bom-diff.dto';
import { BomReconcileRequestDto } from '../dto/bom-reconcile.dto';
import { SalesOrderBomCompareRequestDto } from '../../sales-orders/dto/sales-order-bom-compare.dto';

describe('MappingCommitService', () => {
  let service: MappingCommitService;

  const mockQueryRunnerManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn((_entity: any, data: any) => Promise.resolve(data)),
    create: jest.fn((_entity: any, data: any) => data),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockQueryRunnerManager,
  };

  // diff()는 트랜잭션 없이 this.dataSource.manager를 직접 쓴다(읽기 전용).
  const mockDataSourceManager = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    manager: mockDataSourceManager,
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

  // PR-233: commit()이 신규 Item을 구분할 때 이제 material.id로 기존 BomItem과 매칭한다
  // (이름 비교를 normalizeForFuzzyMatch로 올리면서, 같은 payload 안에서 자재명이 다른
  // 두 행이 둘 다 "id 없음(undefined)"으로 저장되면 서로 같은 자재로 오인되는 걸 막기
  // 위해, 실제 DB의 autoincrement처럼 저장 시 고유 id를 부여해야 한다).
  let nextMockItemId = 1000;

  beforeEach(async () => {
    jest.clearAllMocks();
    nextMockItemId = 1000;
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunnerManager.save.mockImplementation((entity: any, data: any) =>
      Promise.resolve(entity === Item && data?.id == null ? { ...data, id: nextMockItemId++ } : data),
    );
    mockQueryRunnerManager.create.mockImplementation((_entity: any, data: any) => data);
    mockQueryRunnerManager.findOne.mockResolvedValue(null);
    mockQueryRunnerManager.find.mockResolvedValue([]); // 기본: 이 스타일에 등록된 BOM 없음
    mockQueryRunnerManager.delete.mockResolvedValue({ affected: 1 });
    mockQueryRunnerManager.count.mockResolvedValue(0);
    mockDataSourceManager.find.mockResolvedValue([]);
    mockDataSourceManager.findOne.mockResolvedValue(null);

    service = new MappingCommitService(mockDataSource as unknown as DataSource);
  });

  describe('commit (성공 케이스)', () => {
    it('overviewData.shipDate를 StyleOverview.firstShipDate로 매핑하고 status 기본값을 채워 저장해야 한다', async () => {
      const result = await service.commit(validPayload);

      // PR-132: notices(구조화) 추가 — warnings(문자열 배열)는 기존 호출부 호환을 위해 그대로 유지된다.
      expect(result).toEqual({ success: true, styleNo: 'MB62SLM103Z', notices: [], warnings: [] });

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

    // PR-211: 신규 스타일은 지킬 기존 값이 없으므로 파싱값 0이 그대로 저장된다
    // (덮어쓰기 위험은 "기존 값이 있는 스타일에 재업로드"할 때만 해당 — mergeOverview
    // 쪽 테스트 참고). 신규 생성 경로(mergeOverview를 안 타는 쪽)는 그대로 둔다.
    it('신규 스타일 + 파싱값 0 → 0으로 저장된다(기존 동작 유지, 지킬 값이 없음)', async () => {
      await service.commit({ ...validPayload, overviewData: { ...validPayload.overviewData, totalQty: 0 } });

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.totalQty).toBe(0);
    });

    // PR-175: 사람이 검토 화면에서 확인한 실/테이프 종류(threadType/tapeType)가
    // 신규 BomItem 생성 시 그대로 저장되는지 — AI 후보(materialSubTypeCandidate)는
    // CommitBomItemDto에 아예 없으므로 여기선 다루지 않는다(저장 대상이 아님).
    it('bomItems에 threadType/tapeType이 있으면 신규 BomItem에 그대로 저장되어야 한다', async () => {
      await service.commit({
        ...validPayload,
        bomItems: [
          { id: 1, category: '부자재', itemName: '코아사', consumption: 1, requiredQty: 700, colorOf: 'FREE', spec: '', threadType: 'COA_SA' } as any,
          { id: 2, category: '부자재', itemName: '다데테이프', consumption: 1, requiredQty: 700, colorOf: 'FREE', spec: '', tapeType: 'DADE' } as any,
        ],
      });

      const bomItemSaves = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      expect(bomItemSaves[0][1]).toEqual(expect.objectContaining({ threadType: 'COA_SA', tapeType: null }));
      expect(bomItemSaves[1][1]).toEqual(expect.objectContaining({ threadType: null, tapeType: 'DADE' }));
    });

    it('bomItems에 threadType/tapeType이 없으면(일반 자재) 둘 다 null로 저장되어야 한다', async () => {
      await service.commit(validPayload);
      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1]).toEqual(expect.objectContaining({ threadType: null, tapeType: null }));
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
      mockQueryRunnerManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Item ? [existingMaterial] : []),
      );

      await service.commit(validPayload);

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave).toBeUndefined(); // 신규 생성 안 함

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].material).toEqual(existingMaterial);
    });

    // PR-234(사용자 확인 사례): 신규 자재는 이번 행이 들고 온 영문 표기를 바로 채운다.
    it('신규 자재를 만들 때 bomItem.englishName이 있으면 Item.englishName으로 저장된다', async () => {
      await service.commit({
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], englishName: 'POLY BAG(EN)' }],
      });

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave![1]).toMatchObject({ englishName: 'POLY BAG(EN)' });
    });

    // PR-234: 기존 자재는 영문명이 비어 있을 때만 채운다(이어지는 재저장에서 값이
    // 있으면 덮어쓰지 않는다 — 아래 별도 테스트).
    it('기존 자재의 englishName이 비어 있으면 이번 행의 englishName으로 채운다', async () => {
      const existingMaterial = { id: 42, name: 'POLY BAG', englishName: null };
      mockQueryRunnerManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Item ? [existingMaterial] : []),
      );

      await service.commit({
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], englishName: 'POLY BAG(EN)' }],
      });

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave![1]).toMatchObject({ id: 42, englishName: 'POLY BAG(EN)' });
    });

    it('기존 자재에 이미 englishName이 있으면 덮어쓰지 않는다(Item 저장 호출도 없음)', async () => {
      const existingMaterial = { id: 42, name: 'POLY BAG', englishName: '기존영문명' };
      mockQueryRunnerManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Item ? [existingMaterial] : []),
      );

      await service.commit({
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], englishName: 'POLY BAG(EN)' }],
      });

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave).toBeUndefined(); // Item 저장 자체가 호출되지 않는다.
      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1].material.englishName).toBe('기존영문명'); // 그대로 유지.
    });

    // PR-220: 신규 스타일(처음 커밋)에서도 sheetQty/sheetQtyUnit이 저장되는지 — 수주
    // 등록(작지 AI) 경로가 commitAnalysis를 통해 이 필드를 채워 보내는 경로의 기초.
    it('bomItems에 유효한 sheetQty/sheetQtyUnit이 있으면 신규 BomItem에 그대로 저장된다', async () => {
      await service.commit({
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], sheetQty: 760, sheetQtyUnit: 'Y' }],
      });
      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1]).toEqual(expect.objectContaining({ sheetQty: 760, sheetQtyUnit: 'Y' }));
    });

    it('bomItems에 sheetQty가 없으면(엑셀 매핑 경로) 신규 BomItem의 sheetQty/sheetQtyUnit은 null이다', async () => {
      await service.commit(validPayload);
      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1]).toEqual(expect.objectContaining({ sheetQty: null, sheetQtyUnit: null }));
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

  // PR-236(사용자 보고): "bomItems.13.colorOf must be a string" — 엑셀 파서 근본 수정
  // (section-parser.util.ts)과는 별개로, DTO 레벨에도 안전망을 둔다(저장된 초안·
  // 구버전 프런트가 비문자 값을 보내도 받아낸다). 숫자·불리언은 문자열로 바꾸고,
  // 객체·배열 같은 "이상한 값"은 계속 거부해야 한다(검증 자체를 지우지 않음).
  describe('CommitBomItemDto colorOf/spec 등 — 비문자 값 안전망 (PR-236)', () => {
    it.each([
      ['숫자', 55, '55'],
      ['0(숫자)', 0, '0'],
      ['불리언', true, 'true'],
      ['앞뒤 공백 있는 문자열', '  BK  ', 'BK'],
    ])('colorOf가 %s면 문자열 "%s"로 변환되어 검증을 통과한다', async (_label, raw, expected) => {
      const dto = plainToInstance(CommitMappingDto, {
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], colorOf: raw }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect((dto.bomItems[0] as any).colorOf).toBe(expected);
    });

    it('colorOf가 null/undefined면 그대로 두고(@IsOptional) 검증을 통과한다', async () => {
      for (const raw of [null, undefined]) {
        const dto = plainToInstance(CommitMappingDto, {
          ...validPayload,
          bomItems: [{ ...validPayload.bomItems[0], colorOf: raw }],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('colorOf가 객체·배열이면 문자열로 바꾸지 않고 여전히 거부한다(이상한 값은 계속 거부)', async () => {
      for (const raw of [{ nested: true }, [1, 2, 3]]) {
        const dto = plainToInstance(CommitMappingDto, {
          ...validPayload,
          bomItems: [{ ...validPayload.bomItems[0], colorOf: raw }],
        });
        const errors = await validate(dto);
        const bomItemsErrors = errors.find((e) => e.property === 'bomItems');
        expect(bomItemsErrors).toBeDefined();
      }
    });

    it('spec도 colorOf와 같은 안전망을 쓴다(숫자 → 문자열)', async () => {
      const dto = plainToInstance(CommitMappingDto, {
        ...validPayload,
        bomItems: [{ ...validPayload.bomItems[0], spec: 36 }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect((dto.bomItems[0] as any).spec).toBe('36');
    });
  });

  // PR-098: 같은 styleNo로 재커밋될 때 기존 StyleOverview/Bom을 통째로 교체·중복
  // 생성하지 않고 병합하는지 검증한다. LB6YSLM107Z(기존 BK 컬러 215장 + 신규 CR/BR
  // 컬러 추가) 실사례를 그대로 재현한다.
  describe('composition(혼용률) DTO 검증 (PR-246)', () => {
    const toDto = (composition: any) =>
      plainToInstance(CommitMappingDto, { ...validPayload, bomItems: [{ ...validPayload.bomItems[0], composition }] });

    it.each([
      ['COTTON 60% POLYESTER 40%', 'COTTON 60% POLYESTER 40%'],
      ['  COTTON 100%  ', 'COTTON 100%'],
      [100, '100'],
    ])('%p는 문자열 %p로 받는다(대소문자·내용 변경 없음)', async (raw, expected) => {
      const dto = toDto(raw);
      expect(await validate(dto)).toHaveLength(0);
      expect((dto.bomItems[0] as any).composition).toBe(expected);
    });

    it('null/undefined는 그대로 통과한다', async () => {
      for (const raw of [null, undefined]) expect(await validate(toDto(raw))).toHaveLength(0);
    });

    it('길이 상한(500자)을 넘으면 거부한다', async () => {
      expect((await validate(toDto('A'.repeat(501)))).length).toBeGreaterThan(0);
      expect(await validate(toDto('A'.repeat(500)))).toHaveLength(0);
    });

    it('객체·배열은 거부한다', async () => {
      for (const raw of [{ a: 1 }, [1]]) expect((await validate(toDto(raw))).length).toBeGreaterThan(0);
    });

    it('decisions.incoming[].overwriteComposition은 불리언만 허용한다', async () => {
      const ok = plainToInstance(CommitMappingDto, { ...validPayload, decisions: { incoming: [{ index: 0, action: 'update', overwriteComposition: true }] } });
      expect(await validate(ok)).toHaveLength(0);
      const bad = plainToInstance(CommitMappingDto, { ...validPayload, decisions: { incoming: [{ index: 0, action: 'update', overwriteComposition: 'yes' }] } });
      expect((await validate(bad)).length).toBeGreaterThan(0);
    });

    it('AiBomItemDto도 composition을 받는다(없으면 통과, 숫자는 문자열 변환)', async () => {
      const mk = (composition: any) => plainToInstance(AiBomItemDto, { category: null, itemName: 'FAB A', spec: null, colorCode: null, consumption: null, requiredQty: null, supplier: null, remarks: null, composition });
      expect(await validate(mk(undefined))).toHaveLength(0);
      expect(await validate(mk(null))).toHaveLength(0);
      const dto = mk(' COTTON 100% ');
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.composition).toBe('COTTON 100%');
      expect(mk(5).composition).toBe('5');
    });
  });

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
        return Promise.resolve(null);
      });
      mockQueryRunnerManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) return Promise.resolve([{ ...existingBom, items: [{ ...existingBomItem }] }]);
        if (entity === Item) return Promise.resolve([{ id: 10, name: '원단' }]);
        return Promise.resolve([]);
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

    // PR-132: 화면이 문자열 패턴이 아니라 type/code로 "자동 반영 안 됨(확인 필요)"과 "자동 적용됨(정보)"을 구분한다.
    it('(c2) factory 충돌은 NEEDS_REVIEW/FACTORY_MISMATCH 알림이고, warnings는 그 message와 같다', async () => {
      const result = await service.commit(rebuildPayload());

      expect(result.notices).toEqual([
        {
          type: 'NEEDS_REVIEW',
          code: 'FACTORY_MISMATCH',
          message: "기존 factory 값 '베트남' → 새 값 '삼정' — 자동 반영하지 않음, 확인 후 수동 변경 필요",
        },
      ]);
      expect(result.warnings).toEqual(result.notices.map((n) => n.message));
    });

    it('(c3) 같은 (자재명, 색상, 규격)인데 요척/필요량이 다르면 NEEDS_REVIEW/BOM_ITEM_VALUE_DIFF 알림이고 기존 값은 그대로다', async () => {
      const payload = rebuildPayload();
      payload.overviewData.factory = '베트남'; // factory 충돌 없음
      payload.bomItems = [{ itemName: '원단', category: 'FABRIC', colorCode: 'BK', spec: '', consumption: 1.6, requiredQty: 344 }];

      const result = await service.commit(payload);

      expect(result.notices).toEqual([
        {
          type: 'NEEDS_REVIEW',
          code: 'BOM_ITEM_VALUE_DIFF',
          message: '원단(BK/N/A) 기존 값(요척 1, 소요량 215) → 새 값(요척 1.6, 소요량 344) — 자동 반영하지 않음, 확인 후 수동 변경 필요',
        },
      ]);
      expect(mockQueryRunnerManager.save.mock.calls.some(([entity]: any) => entity === BomItem)).toBe(false); // 기존 자재를 다시 저장하지 않는다
    });

    it('(c4) 차이가 전혀 없으면 notices/warnings 모두 비어 있다', async () => {
      const payload = rebuildPayload();
      payload.overviewData.factory = '베트남';
      payload.bomItems = [{ itemName: '원단', category: 'FABRIC', colorCode: 'BK', spec: '', consumption: 1, requiredQty: 215 }];

      const result = await service.commit(payload);

      expect(result.notices).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('(d) Bom이 이미 있으면 재사용하고 새로 생성하지 않는다', async () => {
      await service.commit(rebuildPayload());

      const bomCreateOrSave = mockQueryRunnerManager.save.mock.calls.some(
        ([arg]: any) => arg && typeof arg === 'object' && 'bomNo' in arg,
      );
      expect(bomCreateOrSave).toBe(false);
    });

    // PR-123: 재커밋 시 재사용할 BOM도 "BOM 중복 검토"에서 고른 활성 BOM을 쓴다(그 BOM에 신규 항목이 병합된다).
    // 세 경우 모두 새 BOM을 만들지 않고 기존 BOM 하나에만 CR 항목을 붙여야 한다.
    const bomWith = (id: number, isActive?: boolean) => ({
      ...existingBom,
      id,
      ...(isActive === undefined ? {} : { isActive }),
      items: id === 0 ? [] : [{ ...existingBomItem }],
    });
    const crSavedTo = () => {
      const saves = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      expect(saves).toHaveLength(1);
      expect(mockQueryRunnerManager.save.mock.calls.some(([arg]: any) => arg && typeof arg === 'object' && 'bomNo' in arg)).toBe(false); // 새 BOM을 만들지 않는다
      return saves[0][1].bom.id;
    };
    const givenBoms = (boms: any[]) =>
      mockQueryRunnerManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) return Promise.resolve(boms);
        if (entity === Item) return Promise.resolve([{ id: 10, name: '원단' }]);
        return Promise.resolve([]);
      });

    it('(e) id가 더 큰 BOM이 비활성이면 활성(더 오래된) BOM에 병합한다', async () => {
      givenBoms([bomWith(50, true), bomWith(90, false)]);
      await service.commit(rebuildPayload());
      expect(crSavedTo()).toBe(50);
    });

    it('(f) isActive 정보가 없는 데이터는 이전 규칙과 같이 가장 큰 id의 BOM에 병합한다', async () => {
      givenBoms([bomWith(50), bomWith(90)]);
      await service.commit(rebuildPayload());
      expect(crSavedTo()).toBe(90);
    });

    it('(g) 활성 BOM이 하나도 없는 비정상 상태도 가장 큰 id의 BOM에 병합한다(새 BOM을 만들지 않는다)', async () => {
      givenBoms([bomWith(50, false), bomWith(90, false)]);
      await service.commit(rebuildPayload());
      expect(crSavedTo()).toBe(90);
    });

    it('(h) 활성 BOM이 여러 건이면 그중 최신에 병합한다', async () => {
      givenBoms([bomWith(50, true), bomWith(70, true), bomWith(90, false)]);
      await service.commit(rebuildPayload());
      expect(crSavedTo()).toBe(70);
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

    // PR-220: sheetQty/sheetQtyUnit은 "기존 BomItem은 건드리지 않는다" 규칙의 예외다 —
    // 소요량 계산 기준(발주수량)에 쓰이는 값이라, 재업로드로 유효한(유한한 양수) 작지
    // 수량이 들어오면 그 두 컬럼만 갱신한다(다른 필드는 여전히 그대로).
    describe('sheetQty/sheetQtyUnit (PR-220 — 작지 수량, 재업로드에서 null로 덮어쓰지 않음)', () => {
      it('재업로드에서 기존 (자재명,색상,규격)에 유효한 sheetQty가 오면 그 BomItem의 sheetQty/sheetQtyUnit만 갱신해 저장한다', async () => {
        const payload = rebuildPayload();
        payload.bomItems[0] = { ...payload.bomItems[0], sheetQty: 760, sheetQtyUnit: 'Y' }; // 기존 BK 행
        await service.commit(payload);

        const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
        const bkSave = bomItemSaveCalls.find(([, data]: any) => data.colorCode === 'BK' || data.id === 501);
        expect(bkSave).toBeDefined();
        expect(bkSave![1]).toMatchObject({ sheetQty: 760, sheetQtyUnit: 'Y' });
        // 다른 필드(요척 등)는 건드리지 않는다 — existingBomItem 그대로.
        expect(bkSave![1].consumption).toBe(1);
      });

      it.each([undefined, null, 0, -1, NaN])('재업로드에서 sheetQty가 %p(못 읽음/0/음수)이면 기존 BomItem을 전혀 저장하지 않는다(null로 지우지 않음)', async (bad) => {
        const payload = rebuildPayload();
        payload.bomItems[0] = { ...payload.bomItems[0], sheetQty: bad as any, sheetQtyUnit: 'Y' };
        await service.commit(payload);

        const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
        expect(bomItemSaveCalls.some(([, data]: any) => data.colorCode === 'BK' || data.id === 501)).toBe(false);
      });

      it('새로 추가되는 BomItem(신규 컬러 CR)에는 sheetQty/sheetQtyUnit이 함께 저장된다', async () => {
        const payload = rebuildPayload();
        payload.bomItems[1] = { ...payload.bomItems[1], sheetQty: 758, sheetQtyUnit: 'Y' }; // 신규 CR 행
        await service.commit(payload);

        const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
        const crSave = bomItemSaveCalls.find(([, data]: any) => data.colorCode === 'CR');
        expect(crSave![1]).toMatchObject({ sheetQty: 758, sheetQtyUnit: 'Y' });
      });

      it('sheetQty를 전혀 보내지 않으면(엑셀 매핑 경로) 새 BomItem도 sheetQty/sheetQtyUnit이 null로 저장된다(변경 없음)', async () => {
        await service.commit(rebuildPayload()); // CR 행에 sheetQty 없음

        const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
        const crSave = bomItemSaveCalls.find(([, data]: any) => data.colorCode === 'CR');
        expect(crSave![1]).toMatchObject({ sheetQty: null, sheetQtyUnit: null });
      });
    });

    // PR-249: 오더개요 가드(기존 스타일) — 서버가 강제. 합성 값만 사용. 옵션 없는 호출(엑셀 HTTP)은 기존 동작 그대로.
    describe('오더개요 가드 (PR-249)', () => {
      const overviewPayload = (extra: Record<string, unknown> = {}): CommitMappingDto => ({
        ...rebuildPayload(),
        overviewData: { styleNo: 'LB6YSLM107Z', factory: '베트남', buyer: '다른바이어', totalQty: 999, brand: '브랜드A', ...extra } as any,
      });
      const guard = (overwrite: string[] = []) => ({ overviewGuard: { overwrite: new Set(overwrite) } });
      const savedOverview = () =>
        mockQueryRunnerManager.save.mock.calls.find(([arg]: any) => arg && typeof arg === 'object' && arg.overview)![0].overview;

      it('가드: 비어 있는 항목(brand)은 채우고, 다른 값(buyer·totalQty)은 유지하며 충돌을 돌려준다', async () => {
        const result = await service.commit(overviewPayload(), guard());
        const ov = savedOverview();
        expect(ov.brand).toBe('브랜드A');
        expect(ov.buyer).toBe('미도컴퍼니');
        expect(Number(ov.totalQty)).toBe(215);
        expect(result.orderOverviewConflicts).toEqual([
          { field: 'totalQty', existing: 215, incoming: 999 },
          { field: 'buyer', existing: '미도컴퍼니', incoming: '다른바이어' },
        ]);
        expect(result.notices).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'NEEDS_REVIEW', code: 'ORDER_OVERVIEW_DIFF_KEPT' })]));
      });

      it('가드: 같은 값은 변화·충돌 없음, 들어온 값이 비어 있으면(빈 문자열·null·0) 기존 값을 보존한다', async () => {
        const result = await service.commit(overviewPayload({ buyer: '미도컴퍼니', totalQty: 0, brand: '', styleName: null }), guard());
        const ov = savedOverview();
        expect(ov.buyer).toBe('미도컴퍼니');
        expect(Number(ov.totalQty)).toBe(215);
        expect(ov.brand).toBeNull();
        expect(result.orderOverviewConflicts).toEqual([]);
      });

      it('가드: overwrite 로 지정한 항목만 교체하고, 지정하지 않은 다른 항목은 유지한다', async () => {
        await service.commit(overviewPayload(), guard(['buyer']));
        const ov = savedOverview();
        expect(ov.buyer).toBe('다른바이어');
        expect(Number(ov.totalQty)).toBe(215);
      });

      it('가드: 공장은 기존 보류 규칙 그대로(overwrite 에 있어도 교체하지 않는다)', async () => {
        const result = await service.commit(overviewPayload({ factory: '삼정' }), guard(['factory']));
        expect(savedOverview().factory).toBe('베트남');
        expect(result.notices).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FACTORY_MISMATCH' })]));
      });

      it('가드 없는 호출(엑셀 HTTP /mapping/commit)은 이전 동작 그대로 — 값이 있으면 덮어쓰고 충돌 필드가 응답에 없다', async () => {
        const result = await service.commit(overviewPayload());
        const ov = savedOverview();
        expect(ov.buyer).toBe('다른바이어');
        expect(Number(ov.totalQty)).toBe(999);
        expect(result.orderOverviewConflicts).toBeUndefined();
      });

      it('가드는 자재 행 처리에 영향을 주지 않는다(신규 컬러 CR 추가, 기존 BK 미변경)', async () => {
        await service.commit(overviewPayload(), guard());
        const bomSaves = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
        expect(bomSaves).toHaveLength(1);
        expect(bomSaves[0][1]).toEqual(expect.objectContaining({ colorCode: 'CR' }));
      });

      it('afterMerge 는 병합 뒤 같은 트랜잭션에서 실행되고, 던지면 커밋하지 않고 롤백한다', async () => {
        const order: string[] = [];
        mockQueryRunner.commitTransaction.mockImplementation(async () => { order.push('commit'); });
        const afterMerge = jest.fn(async () => { order.push('after'); });
        await service.commit(overviewPayload(), { afterMerge });
        expect(order).toEqual(['after', 'commit']);
        expect(afterMerge).toHaveBeenCalledWith(mockQueryRunnerManager);

        mockQueryRunner.commitTransaction.mockClear();
        mockQueryRunner.rollbackTransaction.mockClear();
        await expect(service.commit(overviewPayload(), { afterMerge: async () => { throw new Error('contract failed'); } })).rejects.toBeDefined();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });
    });

    // PR-246: 혼용률 — 기존 행 재저장 규칙(서버 강제). 합성 값만 사용.
    describe('혼용률 재저장 규칙 (PR-246)', () => {
      const setExistingComposition = (composition: string | null) => {
        mockQueryRunnerManager.find.mockImplementation((entity: any) => {
          if (entity === Bom) return Promise.resolve([{ ...existingBom, items: [{ ...existingBomItem, composition }] }]);
          if (entity === Item) return Promise.resolve([{ id: 10, name: '원단' }]);
          return Promise.resolve([]);
        });
      };
      const bkPayload = (composition: any, decision?: { overwriteComposition?: boolean }): CommitMappingDto => {
        const payload = rebuildPayload();
        payload.bomItems[0] = { ...payload.bomItems[0], composition };
        if (decision) payload.decisions = { incoming: [{ index: 0, action: 'update', ...decision }] };
        return payload;
      };
      const bkSaves = () =>
        mockQueryRunnerManager.save.mock.calls
          .filter(([entity]: any) => entity === BomItem)
          .filter(([, data]: any) => data.colorCode === 'BK' || data.id === 501);

      it('신규 행(신규 컬러)은 들어온 혼용률을 그대로 저장한다(대소문자·번역 변경 없음)', async () => {
        const payload = rebuildPayload();
        payload.bomItems[1] = { ...payload.bomItems[1], composition: '  Cotton 60% polyester 40%  ' };
        await service.commit(payload);
        const crSave = mockQueryRunnerManager.save.mock.calls.find(([e, d]: any) => e === BomItem && d.colorCode === 'CR');
        expect(crSave![1].composition).toBe('Cotton 60% polyester 40%');
      });

      it('기존 행의 혼용률이 비어 있고 값이 들어오면 채운다(AUTO_APPLIED/COMPOSITION_FILLED)', async () => {
        setExistingComposition(null);
        const result = await service.commit(bkPayload('COTTON 60% POLYESTER 40%'));
        expect(bkSaves()).toHaveLength(1);
        expect(bkSaves()[0][1].composition).toBe('COTTON 60% POLYESTER 40%');
        expect(result.notices).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'AUTO_APPLIED', code: 'COMPOSITION_FILLED' })]));
      });

      it('기존 값과 같으면 변화 없음(저장도 알림도 없다)', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        const result = await service.commit(bkPayload(' COTTON 60% POLYESTER 40% '));
        expect(bkSaves()).toHaveLength(0);
        expect(result.notices.some((n) => n.code.startsWith('COMPOSITION'))).toBe(false);
      });

      it('기존 값과 다르면 기본은 유지하고 NEEDS_REVIEW/COMPOSITION_DIFF_KEPT 알림만 낸다', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        const result = await service.commit(bkPayload('COTTON 100%'));
        expect(bkSaves()).toHaveLength(0);
        expect(result.notices).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'NEEDS_REVIEW', code: 'COMPOSITION_DIFF_KEPT' })]));
      });

      it('다르고 overwriteComposition=false여도 유지한다(명시적 true만 교체)', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        await service.commit(bkPayload('COTTON 100%', { overwriteComposition: false }));
        expect(bkSaves()).toHaveLength(0);
      });

      it('다르고 overwriteComposition=true이면 그 행만 새 값으로 교체한다', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        const result = await service.commit(bkPayload('COTTON 100%', { overwriteComposition: true }));
        expect(bkSaves()).toHaveLength(1);
        expect(bkSaves()[0][1].composition).toBe('COTTON 100%');
        expect(result.notices.some((n) => n.code === 'COMPOSITION_DIFF_KEPT')).toBe(false);
      });

      it('skipComposition=true이면 비어 있어도 채우지 않는다(사람이 "채우기"를 해제한 행)', async () => {
        setExistingComposition(null);
        const result = await service.commit(bkPayload('COTTON 100%', { skipComposition: true } as any));
        expect(bkSaves()).toHaveLength(0);
        expect(result.notices.some((n) => n.code.startsWith('COMPOSITION'))).toBe(false);
      });

      it.each([undefined, null, '', '   '])('들어온 혼용률이 %p(비어 있음)이면 기존 값을 지우지 않는다(overwrite=true여도)', async (empty) => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        await service.commit(bkPayload(empty, { overwriteComposition: true }));
        expect(bkSaves()).toHaveLength(0);
      });

      it('mergeInto로 합쳐도 같은 규칙이 적용된다(다름→유지, overwrite=true→교체)', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        const kept = bkPayload('COTTON 100%');
        kept.decisions = { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 501 }] };
        await service.commit(kept);
        expect(bkSaves()).toHaveLength(0);

        mockQueryRunnerManager.save.mockClear();
        const replaced = bkPayload('COTTON 100%');
        replaced.decisions = { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 501, overwriteComposition: true }] };
        await service.commit(replaced);
        expect(bkSaves()[0][1].composition).toBe('COTTON 100%');
      });

      it('혼용률을 보내지 않는 일괄 저장(엑셀) 경로는 기존 행을 저장하지 않는다(이전 동작 불변)', async () => {
        setExistingComposition('COTTON 60% POLYESTER 40%');
        const result = await service.commit(rebuildPayload());
        expect(bkSaves()).toHaveLength(0);
        expect(result.notices.some((n) => n.code.startsWith('COMPOSITION'))).toBe(false);
      });

      it('혼용률 덮어쓰기와 sheetQty 갱신이 함께 와도 수동 필요수량은 보존된다', async () => {
        mockQueryRunnerManager.find.mockImplementation((entity: any) => {
          if (entity === Bom) {
            return Promise.resolve([{ ...existingBom, items: [{ ...existingBomItem, composition: 'COTTON 100%', manualRequiredQty: 499, manualRequiredQtyNote: '현장 확인' }] }]);
          }
          if (entity === Item) return Promise.resolve([{ id: 10, name: '원단' }]);
          return Promise.resolve([]);
        });
        const payload = bkPayload('POLYESTER 100%', { overwriteComposition: true });
        payload.bomItems[0] = { ...payload.bomItems[0], sheetQty: 760, sheetQtyUnit: 'Y' };
        await service.commit(payload);
        expect(bkSaves()).toHaveLength(1); // 한 번만 저장
        expect(bkSaves()[0][1]).toMatchObject({ composition: 'POLYESTER 100%', sheetQty: 760, manualRequiredQty: 499, manualRequiredQtyNote: '현장 확인' });
      });
    });

    // PR-231: 재업로드/재저장(매핑 병합)이 수동 지정 값을 지우거나 덮어쓰면 안 된다(PR-212의
    // MANUAL 보존 원칙과 같음) — 같은 (자재명,색상,규격)으로 다시 커밋해도(sheetQty가 같이
    // 와서 그 행이 실제로 저장되는 경우 포함) 수동 값은 그대로 유지된다.
    it('같은 작지를 다시 저장해도(sheetQty 갱신 포함) 기존 행의 수동 지정 값은 지워지지 않는다', async () => {
      mockQueryRunnerManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) {
          return Promise.resolve([
            { ...existingBom, items: [{ ...existingBomItem, manualRequiredQty: 499, manualRequiredQtyNote: '현장 확인', manualRequiredQtyAt: new Date('2026-01-01') }] },
          ]);
        }
        if (entity === Item) return Promise.resolve([{ id: 10, name: '원단' }]);
        return Promise.resolve([]);
      });
      const payload = rebuildPayload();
      payload.bomItems[0] = { ...payload.bomItems[0], sheetQty: 760, sheetQtyUnit: 'Y' };
      await service.commit(payload);

      const bomItemSaveCalls = mockQueryRunnerManager.save.mock.calls.filter(([entity]: any) => entity === BomItem);
      const bkSave = bomItemSaveCalls.find(([, data]: any) => data.colorCode === 'BK' || data.id === 501);
      expect(bkSave).toBeDefined();
      expect(bkSave![1].manualRequiredQty).toBe(499);
      expect(bkSave![1].manualRequiredQtyNote).toBe('현장 확인');
    });

    it('totalQty가 값을 보내면 새 값으로 갱신된다(factory와 달리 예외 없음)', async () => {
      await service.commit(rebuildPayload());

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.totalQty).toBe(430);
    });

    // PR-211: MATERIAL LIST의 QTY 칸이 비어 있으면 파서가 0을 만든다(section-parser.util.ts) —
    // 그 0이 기존 totalQty(215)를 덮어쓰면 안 된다. 유한한 양수일 때만 갱신한다.
    const totalQtyOf = async (overrideTotalQty: unknown): Promise<unknown> => {
      const payload = rebuildPayload();
      (payload.overviewData as any).totalQty = overrideTotalQty;
      await service.commit(payload);
      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      return styleSave[0].overview.totalQty;
    };

    it('기존 totalQty(215) + 파싱값 0 → 기존 값 유지(재업로드가 지우지 않음)', async () => {
      expect(await totalQtyOf(0)).toBe(215);
    });

    it('기존 215 + 파싱값 800(양수) → 800으로 갱신(기존 동작 유지)', async () => {
      expect(await totalQtyOf(800)).toBe(800);
    });

    it.each([undefined, null, NaN, -5])('기존 215 + 파싱값 %p → 기존 값 유지', async (bad) => {
      expect(await totalQtyOf(bad)).toBe(215);
    });

    it('기존 0(또는 null) + 파싱값 0 → 0(변화 없음)', async () => {
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === MasterStyle) {
          return Promise.resolve({ ...existingStyle, overview: { ...existingOverview, totalQty: 0 } });
        }
        if (entity === Item) return Promise.resolve({ id: 10, name: '원단' });
        return Promise.resolve(null);
      });
      expect(await totalQtyOf(0)).toBe(0);
    });

    // PR-168: 미도 전용 수기 CMT단가 — factory와 같은 원칙(자동 덮어쓰기 금지)을
    // 적용한다. 기존 fixture(existingOverview)는 cmtPrice: null이라 "채워짐" 케이스는
    // 별도로 기존 값이 있는 스타일을 재구성해 검증한다.
    it('기존 cmtPrice가 없으면 새 값으로 채워진다', async () => {
      const result = await service.commit({ ...rebuildPayload(), overviewData: { ...rebuildPayload().overviewData, cmtPrice: 7500 } });

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.cmtPrice).toBe(7500);
      expect(result.notices.find((n: any) => n.code === 'CMT_PRICE_MISMATCH')).toBeUndefined();
    });

    it('기존 cmtPrice가 이미 있고 새 값과 다르면 자동으로 바뀌지 않고 NEEDS_REVIEW/CMT_PRICE_MISMATCH로만 기록된다', async () => {
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === MasterStyle) {
          return Promise.resolve({ ...existingStyle, overview: { ...existingOverview, cmtPrice: 7000 } });
        }
        if (entity === Item) return Promise.resolve({ id: 10, name: '원단' });
        return Promise.resolve(null);
      });

      const result = await service.commit({ ...rebuildPayload(), overviewData: { ...rebuildPayload().overviewData, cmtPrice: 8000 } });

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.cmtPrice).toBe(7000); // 기존 값 유지
      expect(result.notices).toEqual(
        expect.arrayContaining([
          { type: 'NEEDS_REVIEW', code: 'CMT_PRICE_MISMATCH', message: "기존 CMT단가 '7000' → 새 값 '8000' — 자동 반영하지 않음, 확인 후 수동 변경 필요" },
        ]),
      );
    });

    it('cmtPrice를 보내지 않으면(undefined) 기존 값을 그대로 둔다', async () => {
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === MasterStyle) {
          return Promise.resolve({ ...existingStyle, overview: { ...existingOverview, cmtPrice: 7000 } });
        }
        if (entity === Item) return Promise.resolve({ id: 10, name: '원단' });
        return Promise.resolve(null);
      });

      const result = await service.commit(rebuildPayload()); // cmtPrice 필드 자체가 없음

      const styleSave = mockQueryRunnerManager.save.mock.calls.find(
        ([arg]: any) => arg && typeof arg === 'object' && arg.overview,
      );
      expect(styleSave[0].overview.cmtPrice).toBe(7000);
      expect(result.notices.find((n: any) => n.code === 'CMT_PRICE_MISMATCH')).toBeUndefined();
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

    it('안감 혼용률 기본값 적용은 AUTO_APPLIED/LINING_COMPOSITION_DEFAULT 알림이다 — 확인 필요(NEEDS_REVIEW)가 아니라 정보성 (PR-132)', async () => {
      const result = await service.commit({
        ...basePayload,
        bomItems: [{ itemName: '안감원단', category: '안감', consumption: 1, requiredQty: 100 }],
      });

      expect(result.notices).toEqual([
        {
          type: 'AUTO_APPLIED',
          code: 'LINING_COMPOSITION_DEFAULT',
          message: "안감 항목 '안감원단' 혼용률 미기재 — 기본값 POLYESTER 100% 자동 적용",
        },
      ]);
      expect(result.warnings).toEqual(result.notices.map((n) => n.message));
      expect(result.notices.some((n) => n.type === 'NEEDS_REVIEW')).toBe(false);
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

  // PR-235(PILOT-23 후속): 저장 전 비교 화면에서 고른 선택(decisions)을 commit()이
  // 반영한다 — decisions가 없으면(위의 다른 모든 commit() 테스트) 기존 동작 그대로다.
  describe('commit — decisions (PR-235)', () => {
    const mergeTargetBomItem: BomItem = {
      id: 501,
      bom: undefined as any,
      material: { id: 10, name: '다데<실크>' } as any,
      category: '부자재',
      colorCode: 'N/A',
      spec: 'N/A',
      consumption: 2 as any,
      requiredQty: 200 as any,
      supplier: null,
      unitPrice: 12.5 as any,
      remarks: '수입산',
      composition: null,
      hsCode: null,
      manualRequiredQty: 150 as any,
      manualRequiredQtyNote: '현장 확인',
      manualRequiredQtyAt: new Date('2026-01-01'),
      threadType: 'COA_SA' as any,
      tapeType: null,
    } as any;
    const deletableBomItem: BomItem = {
      id: 502,
      bom: undefined as any,
      material: { id: 20, name: '삭제대상자재' } as any,
      category: '부자재',
      colorCode: 'N/A',
      spec: 'N/A',
      consumption: 1 as any,
      requiredQty: 50 as any,
      supplier: null,
      unitPrice: 0 as any,
      remarks: 'N/A',
      composition: null,
      hsCode: null,
    } as any;
    const existingBom: Bom = {
      id: 90,
      bomNo: 'BOM-DECISIONS-001',
      version: 'V1',
      isActive: true,
      style: undefined as any,
      items: [mergeTargetBomItem, deletableBomItem],
    };
    const existingStyle: MasterStyle = {
      styleNo: 'DECISIONS-STYLE',
      overview: { id: 1, factory: '베트남', totalQty: 100, buyer: '미도컴퍼니', status: StyleOverviewStatus.PENDING_APPROVAL } as any,
      boms: [],
    };

    beforeEach(() => {
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) =>
        entity === MasterStyle ? Promise.resolve({ ...existingStyle, overview: { ...existingStyle.overview } }) : Promise.resolve(null),
      );
      mockQueryRunnerManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) return Promise.resolve([{ ...existingBom, items: [{ ...mergeTargetBomItem }, { ...deletableBomItem }] }]);
        return Promise.resolve([]);
      });
      mockQueryRunnerManager.count.mockResolvedValue(0);
    });

    const basePayload = (): CommitMappingDto => ({
      styleNo: 'DECISIONS-STYLE',
      overviewData: { styleNo: 'DECISIONS-STYLE', totalQty: 100, factory: '베트남', buyer: '미도컴퍼니', shipDate: '' },
      bomItems: [],
    });

    it('mergeInto: 확정 값(수동 필요수량·확정 단가·종류 지정·비고)을 그대로 두고 sheetQty만 갱신하며, 새 Item을 만들지 않는다', async () => {
      const payload = basePayload();
      payload.bomItems = [{ itemName: '전혀다른이름', category: '부자재', consumption: 9, requiredQty: 999, sheetQty: 300, sheetQtyUnit: 'Y' } as any];
      payload.decisions = { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: 501 }] };

      await service.commit(payload);

      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave).toBeUndefined(); // 새 Item 생성 없음(기존 Item 그대로 사용).

      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave![1]).toMatchObject({
        sheetQty: 300,
        sheetQtyUnit: 'Y',
        // 확정 값 — 들어온 새 값(consumption 9, requiredQty 999)으로 바뀌지 않았다.
        consumption: 2,
        requiredQty: 200,
        unitPrice: 12.5,
        remarks: '수입산',
        manualRequiredQty: 150,
        threadType: 'COA_SA',
      });
    });

    it('existing delete: 연결된 발주(취소 제외)가 있으면 거부되고 전체 롤백된다', async () => {
      mockQueryRunnerManager.count.mockResolvedValue(3);
      const payload = basePayload();
      payload.decisions = { existing: [{ bomItemId: 502, action: 'delete' }] };

      await expect(service.commit(payload)).rejects.toThrow(/발주 3건/);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunnerManager.delete).not.toHaveBeenCalled();
    });

    it('existing delete: 연결된 발주가 없으면 BomItem만 삭제되고 자재 마스터(Item)는 지우지 않는다', async () => {
      const payload = basePayload();
      payload.decisions = { existing: [{ bomItemId: 502, action: 'delete' }] };

      await service.commit(payload);

      expect(mockQueryRunnerManager.delete).toHaveBeenCalledWith(BomItem, 502);
      expect(mockQueryRunnerManager.delete.mock.calls.some(([entity]: any) => entity === Item)).toBe(false);
    });

    it('existing keep: 아무 일도 일어나지 않는다(기본 동작과 동일)', async () => {
      const payload = basePayload();
      payload.decisions = { existing: [{ bomItemId: 502, action: 'keep' }] };

      await service.commit(payload);

      expect(mockQueryRunnerManager.delete).not.toHaveBeenCalled();
    });

    it('존재하지 않는 bomItemId를 delete로 보내면 400으로 거부된다', async () => {
      const payload = basePayload();
      payload.decisions = { existing: [{ bomItemId: 9999, action: 'delete' }] };

      await expect(service.commit(payload)).rejects.toThrow(/스타일 .* 자재명세가 아닙니다/);
    });
  });

  // PR-198: 저장 전 "기존 BOM과 비교"(읽기 전용) — MB73SKM109Z 실사례(다데<실크> 2.7→2.9) 재현.
  describe('diff (PR-198)', () => {
    const existingBomItem: BomItem = {
      id: 501,
      bom: undefined as any,
      material: { id: 10, name: '다데<실크>' } as any,
      category: '부자재',
      colorCode: 'N/A',
      spec: 'N/A',
      consumption: 2.7 as any,
      requiredQty: 2646 as any,
      supplier: null,
      unitPrice: 0 as any,
      remarks: 'N/A',
      composition: null,
      hsCode: null,
    };
    const existingBom: Bom = {
      id: 77,
      bomNo: 'BOM-MB73SKM109Z-001',
      version: 'V1',
      isActive: true,
      style: undefined as any,
      items: [existingBomItem],
    };

    const diffPayload: BomDiffRequestDto = {
      styleNo: 'MB73SKM109Z',
      bomItems: [{ itemName: '다데<실크>', category: '부자재', consumption: 2.9 } as any],
    };

    it('그 스타일에 등록된 BOM이 없으면 hasExistingBom=false만 돌려주고 비교하지 않는다', async () => {
      mockDataSourceManager.find.mockResolvedValue([]);
      const result = await service.diff(diffPayload);
      expect(result).toEqual({ hasExistingBom: false });
    });

    it('기존 BOM이 있으면 요척 2.7→2.9 차이를 VALUE_DIFF로 분류한다', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Bom ? [existingBom] : []),
      );
      const result = await service.diff(diffPayload);
      expect(result.hasExistingBom).toBe(true);
      expect(result.rows).toEqual([
        {
          type: 'VALUE_DIFF',
          existing: expect.objectContaining({ bomItemId: 501, itemName: '다데<실크>', consumption: 2.7, linkedPoCount: 0 }),
          incoming: expect.objectContaining({ itemName: '다데<실크>', consumption: 2.9 }),
        },
      ]);
    });

    it('기존 행에 연결된(취소 아닌) 발주가 있으면 linkedPoCount가 채워진다', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) return Promise.resolve([existingBom]);
        if (entity === PurchaseOrder) return Promise.resolve([{ itemId: 10 }, { itemId: 10 }]);
        return Promise.resolve([]);
      });
      const result = await service.diff(diffPayload);
      expect(result.rows?.[0].existing?.linkedPoCount).toBe(2);
    });
  });

  // PR-235(PILOT-23 후속): 작지 저장 전 비교 — 읽기 전용(DB 쓰기 없음).
  describe('compareSalesOrderBom (PR-235)', () => {
    const existingBomItem: BomItem = {
      id: 501,
      bom: undefined as any,
      material: { id: 10, name: '다데<실크>', englishName: null, unit: 'Y' } as any,
      category: '부자재',
      colorCode: 'N/A',
      spec: 'N/A',
      consumption: 2.7 as any,
      requiredQty: 2646 as any,
      supplier: null,
      unitPrice: 0 as any,
      remarks: 'N/A',
      composition: null,
      hsCode: null,
      manualRequiredQty: null,
      threadType: null,
      tapeType: null,
    } as any;
    const existingBom: Bom = {
      id: 77,
      bomNo: 'BOM-MB73SKM109Z-001',
      version: 'V1',
      isActive: true,
      style: undefined as any,
      items: [existingBomItem],
    };
    const comparePayload: SalesOrderBomCompareRequestDto = {
      styleNo: 'MB73SKM109Z',
      bomItems: [{ itemName: '다데<실크>', category: '부자재', consumption: 2.9 } as any],
    };

    it('그 스타일에 등록된 BOM이 없으면 hasExistingBom=false, rows는 빈 배열', async () => {
      mockDataSourceManager.find.mockResolvedValue([]);
      const result = await service.compareSalesOrderBom(comparePayload);
      expect(result).toEqual({ hasExistingBom: false, rows: [] });
    });

    it('정규화 이름+색상+규격이 같으면 same으로 분류된다', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) => Promise.resolve(entity === Bom ? [existingBom] : []));
      const result = await service.compareSalesOrderBom(comparePayload);
      expect(result.hasExistingBom).toBe(true);
      expect(result.rows).toEqual([expect.objectContaining({ type: 'same', incomingIndex: 0 })]);
    });

    // PR-246: 혼용률 비교 상태 4종(읽기 전용 — 저장 호출 없음).
    it.each([
      ['COTTON 60% POLYESTER 40%', undefined, 'incomingEmpty'],
      [null, 'COTTON 100%', 'fillEmpty'],
      ['COTTON 100%', ' COTTON 100% ', 'same'],
      ['COTTON 100%', 'COTTON 60% POLYESTER 40%', 'differs'],
    ])('기존 혼용률 %p / 들어온 %p → compositionStatus=%s', async (existingValue, incomingValue, status) => {
      mockDataSourceManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Bom ? [{ ...existingBom, items: [{ ...(existingBom.items as any[])[0], composition: existingValue }] }] : []),
      );
      const result = await service.compareSalesOrderBom({
        ...comparePayload,
        bomItems: [{ ...comparePayload.bomItems[0], composition: incomingValue as any }],
      });
      expect(result.rows[0]).toMatchObject({
        type: 'same',
        compositionStatus: status,
        existingComposition: existingValue == null ? null : existingValue,
        incomingComposition: incomingValue == null ? null : String(incomingValue).trim(),
      });
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    // PR-250: 사전 점검이 "작지 수량이 바뀌는지" 판단할 수 있도록 기존 행의 sheetQty 를 읽기 전용으로 돌려준다.
    it.each([[760, 760], [null, null], [undefined, null]])('기존 행 sheetQty %p → 응답 %p (읽기 전용, 저장 호출 없음)', async (stored, expected) => {
      mockDataSourceManager.find.mockImplementation((entity: any) =>
        Promise.resolve(entity === Bom ? [{ ...existingBom, items: [{ ...(existingBom.items as any[])[0], sheetQty: stored }] }] : []),
      );
      const result = await service.compareSalesOrderBom(comparePayload);
      expect(result.rows[0].existing?.sheetQty).toBe(expected);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('기존 행의 연결 정보(발주/입고 건수, 삭제 가능 여부, 수동·확정값 보유)가 담긴다', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) => {
        if (entity === Bom) return Promise.resolve([existingBom]);
        if (entity === PurchaseOrder) {
          return Promise.resolve([
            { itemId: 10, status: PurchaseOrderStatus.RECEIVED },
            { itemId: 10, status: PurchaseOrderStatus.PENDING },
          ]);
        }
        return Promise.resolve([]);
      });
      const result = await service.compareSalesOrderBom(comparePayload);
      expect(result.rows[0].existing).toMatchObject({
        linkedPurchaseOrderCount: 2,
        linkedReceivingCount: 1,
        canDelete: false,
        blockedReason: expect.stringContaining('발주 2건'),
        hasManualOverride: false,
        hasConfirmedUnitPrice: false,
        hasSubtypeAssignment: false,
      });
    });

    it('연결된 발주가 없으면 canDelete=true, blockedReason=null', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) => Promise.resolve(entity === Bom ? [existingBom] : []));
      const result = await service.compareSalesOrderBom(comparePayload);
      expect(result.rows[0].existing).toMatchObject({ canDelete: true, blockedReason: null });
    });

    it('비교는 읽기 전용이다 — save/delete/create/count가 전혀 호출되지 않는다', async () => {
      mockDataSourceManager.find.mockImplementation((entity: any) => Promise.resolve(entity === Bom ? [existingBom] : []));
      await service.compareSalesOrderBom(comparePayload);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
      expect(mockQueryRunnerManager.delete).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });
  });

  // PR-198: 비교 화면에서 고른 동작 적용 — all-or-nothing.
  describe('reconcile (PR-198)', () => {
    const bomItem = (id: number, materialName: string, consumption: number): BomItem => ({
      id,
      bom: undefined as any,
      material: { id: id + 1000, name: materialName } as any,
      category: '부자재',
      colorCode: 'N/A',
      spec: 'N/A',
      consumption: consumption as any,
      requiredQty: (consumption * 980) as any,
      supplier: null,
      unitPrice: 0 as any,
      remarks: 'N/A',
      composition: null,
      hsCode: null,
    });

    const bomFixture = (items: BomItem[]): Bom => ({
      id: 77,
      bomNo: 'BOM-MB73SKM109Z-001',
      version: 'V1',
      isActive: true,
      style: { styleNo: 'MB73SKM109Z', overview: { totalQty: 980 } } as any,
      items,
    });

    it('OVERWRITE — 요척을 2.7→2.9로 덮어쓰면 소요량도 2.9×980=2,842로 재계산된다', async () => {
      const existing = bomItem(501, '다데<실크>', 2.7);
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);

      const payload: BomReconcileRequestDto = {
        styleNo: 'MB73SKM109Z',
        actions: [{ type: 'OVERWRITE', bomItemId: 501, newItem: { itemName: '다데<실크>', consumption: 2.9 } as any }],
      };
      const result = await service.reconcile(payload);

      expect(result.applied).toEqual({ overwritten: 1, added: 0, removed: 0, replaced: 0 });
      const saveCall = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(saveCall[1]).toEqual(expect.objectContaining({ consumption: 2.9, requiredQty: 2842 }));
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('ADD — 엑셀에만 있는 행을 새 BOM 행으로 추가한다(자재는 이름으로 찾고 없으면 생성)', async () => {
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([])]);
      mockQueryRunnerManager.findOne.mockResolvedValue(null); // 자재 마스터에 없음 → 새로 생성

      const payload: BomReconcileRequestDto = {
        styleNo: 'MB73SKM109Z',
        actions: [{ type: 'ADD', newItem: { itemName: '새자재', consumption: 1 } as any }],
      };
      const result = await service.reconcile(payload);

      expect(result.applied.added).toBe(1);
      const itemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Item);
      expect(itemSave).toBeDefined();
      const bomItemSave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(bomItemSave[1]).toEqual(expect.objectContaining({ consumption: 1, requiredQty: 980 }));
    });

    it('REMOVE — 행을 제거해도 Item/발주는 건드리지 않고, 연결 발주가 있으면 warnings에 남는다', async () => {
      const existing = bomItem(501, '다데<실크>', 2.7);
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);
      mockQueryRunnerManager.count.mockResolvedValue(3);

      const payload: BomReconcileRequestDto = { styleNo: 'MB73SKM109Z', actions: [{ type: 'REMOVE', bomItemId: 501 }] };
      const result = await service.reconcile(payload);

      expect(result.applied.removed).toBe(1);
      expect(mockQueryRunnerManager.delete).toHaveBeenCalledWith(BomItem, 501);
      expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('연결된 발주(취소 제외) 3건')]));
    });

    it('REPLACE — 기존 행이 가리키는 자재를 엑셀 이름의(이미 있는) 자재로 바꾸고 값도 갱신한다', async () => {
      const existing = bomItem(501, 'DARK GREY DG (원단A)', 1.73);
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);
      const replacementMaterial = { id: 999, name: '원단A' };
      mockQueryRunnerManager.findOne.mockResolvedValue(replacementMaterial);

      const payload: BomReconcileRequestDto = {
        styleNo: 'MB73SKM109Z',
        actions: [{ type: 'REPLACE', bomItemId: 501, newItem: { itemName: '원단A', consumption: 1.72 } as any }],
      };
      const result = await service.reconcile(payload);

      expect(result.applied.replaced).toBe(1);
      const saveCall = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(saveCall[1].material).toEqual(replacementMaterial);
      expect(saveCall[1]).toEqual(expect.objectContaining({ consumption: 1.72 }));
    });

    // PR-231: REPLACE(자재 교체)는 수동 지정 값을 이어가지 않는다(초기화가 기본).
    it('REPLACE — 기존 행에 수동 지정 값이 있었어도 자재 교체 시 초기화된다', async () => {
      const existing = {
        ...bomItem(501, 'DARK GREY DG (원단A)', 1.73),
        manualRequiredQty: 499 as any,
        manualRequiredQtyNote: '메모',
        manualRequiredQtyAt: new Date('2026-01-01') as any,
      };
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);
      mockQueryRunnerManager.findOne.mockResolvedValue({ id: 999, name: '원단A' });

      const payload: BomReconcileRequestDto = {
        styleNo: 'MB73SKM109Z',
        actions: [{ type: 'REPLACE', bomItemId: 501, newItem: { itemName: '원단A', consumption: 1.72 } as any }],
      };
      await service.reconcile(payload);

      const saveCall = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === BomItem);
      expect(saveCall[1].manualRequiredQty).toBeNull();
      expect(saveCall[1].manualRequiredQtyNote).toBeNull();
      expect(saveCall[1].manualRequiredQtyAt).toBeNull();
    });

    it('다른 스타일의 bomItemId가 섞이면 400이고 전체 롤백된다', async () => {
      const existing = bomItem(501, '다데<실크>', 2.7);
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);

      const payload: BomReconcileRequestDto = {
        styleNo: 'MB73SKM109Z',
        actions: [
          { type: 'OVERWRITE', bomItemId: 501, newItem: { itemName: '다데<실크>', consumption: 2.9 } as any },
          { type: 'REMOVE', bomItemId: 9999 }, // 이 스타일 BOM 소속이 아님
        ],
      };

      await expect(service.reconcile(payload)).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      // 첫 action(OVERWRITE)이 실제로 save되지 않았어야 한다(validation을 모든 action에 대해 먼저 수행).
      expect(mockQueryRunnerManager.save.mock.calls.some(([entity]: any) => entity === BomItem)).toBe(false);
    });

    it('등록된 BOM이 없는 스타일이면 404', async () => {
      mockQueryRunnerManager.find.mockResolvedValue([]);
      const payload: BomReconcileRequestDto = { styleNo: 'NO-SUCH-STYLE', actions: [] };
      await expect(service.reconcile(payload)).rejects.toThrow();
    });

    it('제거해도 Item 마스터는 삭제하지 않는다(delete는 BomItem에만 호출)', async () => {
      const existing = bomItem(501, '다데<실크>', 2.7);
      mockQueryRunnerManager.find.mockResolvedValue([bomFixture([existing])]);

      await service.reconcile({ styleNo: 'MB73SKM109Z', actions: [{ type: 'REMOVE', bomItemId: 501 }] });

      expect(mockQueryRunnerManager.delete).not.toHaveBeenCalledWith(Item, expect.anything());
    });
  });
});
