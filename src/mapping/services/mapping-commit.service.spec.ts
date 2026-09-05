import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MappingCommitService } from './mapping-commit.service';
import { StyleOverviewStatus } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile } from '../../imports/entities/import-file.entity';
import { Item } from '../../items/entities/item.entity';
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

      expect(result).toEqual({ success: true, styleNo: 'MB62SLM103Z' });

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
});
