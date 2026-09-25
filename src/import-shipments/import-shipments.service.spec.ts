import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipment, ImportShipmentStatus } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { HsCodeClassificationsService } from '../hs-code-classifications/hs-code-classifications.service';
import { ImportShipmentExcelParser } from './utils/import-shipment-excel-parser.util';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { ImportShipmentPackingDetailsService } from './import-shipment-packing-details.service';
import { ImportShipmentPackingDetailExcelParser } from './utils/import-shipment-packing-detail-excel-parser.util';
import { ImportShipmentPackingDetailSource } from './entities/import-shipment-packing-detail.entity';

jest.mock('./utils/import-shipment-excel-parser.util');
jest.mock('./utils/import-shipment-packing-detail-excel-parser.util');

describe('ImportShipmentsService', () => {
  let service: ImportShipmentsService;
  let shipmentRepo: Repository<ImportShipment>;
  let lineRepo: Repository<ImportShipmentLine>;
  let masterStyleRepo: Repository<MasterStyle>;
  let hsCodeService: HsCodeClassificationsService;
  const mockBrandPrefixRulesService = { findAll: jest.fn().mockResolvedValue([]) };
  const mockPackingDetailsService = { createMany: jest.fn().mockResolvedValue([]) };

  // PR-152: bulkClear()가 트랜잭션으로 묶는다 — work-orders.service.spec.ts와 동일한
  // QueryRunner mock 패턴(manager.save는 넘어온 엔티티를 그대로 반환).
  let mockQueryRunnerManager: { save: jest.Mock };
  let mockQueryRunner: {
    connect: jest.Mock; startTransaction: jest.Mock; commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock; release: jest.Mock; manager: { save: jest.Mock };
  };
  const mockDataSource = { createQueryRunner: jest.fn() };

  beforeEach(async () => {
    mockBrandPrefixRulesService.findAll.mockResolvedValue([]);
    mockPackingDetailsService.createMany.mockClear();
    mockQueryRunnerManager = { save: jest.fn((entity: any) => Promise.resolve(entity)) };
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: mockQueryRunnerManager,
    };
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    (ImportShipmentPackingDetailExcelParser.parse as jest.Mock).mockReturnValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportShipmentsService,
        { provide: BrandPrefixRulesService, useValue: mockBrandPrefixRulesService },
        { provide: ImportShipmentPackingDetailsService, useValue: mockPackingDetailsService },
        {
          provide: getRepositoryToken(ImportShipment),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
            update: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ImportShipmentLine),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 10, ...v })),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MasterStyle),
          useValue: {
            // 기본은 "이미 있는 스타일" — 미등록 스타일 케이스는 각 테스트에서 덮어쓴다(PR-124).
            findOne: jest.fn().mockResolvedValue({ styleNo: 'exists' }),
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve(v)),
          },
        },
        {
          provide: HsCodeClassificationsService,
          useValue: {
            findMatch: jest.fn(),
            findByStyle: jest.fn(),
            upsertStyleMapping: jest.fn(),
            upsertOne: jest.fn(),
          },
        },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(ImportShipmentsService);
    shipmentRepo = module.get(getRepositoryToken(ImportShipment));
    lineRepo = module.get(getRepositoryToken(ImportShipmentLine));
    masterStyleRepo = module.get(getRepositoryToken(MasterStyle));
    hsCodeService = module.get(HsCodeClassificationsService);
  });

  describe('create — HS코드 자동매칭', () => {
    it('일치하는 조합이 있으면 hsCode를 자동으로 채우고 StyleHsCodeMapping을 upsert한다', async () => {
      const match = { id: 5, hsCode: '6202.20.1000' };
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(match);
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        styleNo: 'BF6X27C51',
        lines: [{ id: 10, hsCode: '6202.20.1000' }],
      });

      await service.create({
        styleNo: 'BF6X27C51',
        lines: [
          {
            itemType: "WOMEN'S JACKET",
            fabricType: '직물',
            composition: 'WOOL 98%',
            qty: 100,
            unit: 'EA',
          },
        ],
      } as any);

      expect(hsCodeService.findMatch).toHaveBeenCalledWith("WOMEN'S JACKET", '직물', 'WOOL 98%');
      expect(hsCodeService.upsertStyleMapping).toHaveBeenCalledWith('BF6X27C51', 5);
      expect(lineRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ hsCode: '6202.20.1000' }),
      );
    });

    it('일치하는 조합이 없으면 hsCode는 null로 저장하고 unmatched:true로 표시한다', async () => {
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(null);
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        styleNo: 'BF6X27C99',
        lines: [{ id: 10, hsCode: null }],
      });

      const result = await service.create({
        styleNo: 'BF6X27C99',
        lines: [
          {
            itemType: "WOMEN'S JACKET",
            fabricType: '직물',
            composition: 'UNKNOWN COMPOSITION',
            qty: 50,
            unit: 'EA',
          },
        ],
      } as any);

      expect(hsCodeService.upsertStyleMapping).not.toHaveBeenCalled();
      expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ hsCode: null }));
      expect(result.lines![0].unmatched).toBe(true);
    });

    it('fabricType을 지정하지 않으면 기본값 "직물"로 trim되어 조회된다', async () => {
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(null);
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({ id: 1, styleNo: 'S1', lines: [] });

      await service.create({
        styleNo: 'S1',
        lines: [
          { itemType: "WOMEN'S COAT", composition: 'WOOL 100%', qty: 1, unit: 'EA', fabricType: '  직물  ' },
        ],
      } as any);

      expect(hsCodeService.findMatch).toHaveBeenCalledWith("WOMEN'S COAT", '직물', 'WOOL 100%');
    });
  });

  describe('updateStatus — 상태전이 역행 차단', () => {
    it('PENDING_CLEARANCE -> CLEARED는 허용된다', async () => {
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        status: ImportShipmentStatus.PENDING_CLEARANCE,
        lines: [],
      });

      await service.updateStatus(1, ImportShipmentStatus.CLEARED);
      expect(shipmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ImportShipmentStatus.CLEARED }),
      );
    });

    it('CLEARED -> PENDING_CLEARANCE 역행은 차단된다', async () => {
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        status: ImportShipmentStatus.CLEARED,
        lines: [],
      });

      await expect(service.updateStatus(1, ImportShipmentStatus.PENDING_CLEARANCE)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateLineHsCode — 수동 입력 시 HsCodeClassification 반영', () => {
    it('hsCode를 저장하고 HsCodeClassification/StyleHsCodeMapping을 갱신한다', async () => {
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        styleNo: 'BF6X27C51',
        status: ImportShipmentStatus.PENDING_CLEARANCE,
        lines: [],
      });
      (lineRepo.findOne as jest.Mock).mockResolvedValue({
        id: 10,
        importShipmentId: 1,
        itemType: "WOMEN'S JACKET",
        fabricType: '직물',
        composition: 'WOOL 98%',
        hsCode: null,
      });
      (hsCodeService.upsertOne as jest.Mock).mockResolvedValue({ id: 7 });

      const result = await service.updateLineHsCode(1, 10, { hsCode: '6202.20.1000' });

      expect(hsCodeService.upsertOne).toHaveBeenCalledWith({
        itemType: "WOMEN'S JACKET",
        fabricType: '직물',
        composition: 'WOOL 98%',
        hsCode: '6202.20.1000',
      });
      expect(hsCodeService.upsertStyleMapping).toHaveBeenCalledWith('BF6X27C51', 7);
      expect(result.hsCode).toBe('6202.20.1000');
      expect(result.unmatched).toBe(false);
    });
  });

  describe('importFromFile — Vietnam INV/PKL 엑셀 업로드로 스타일별 ImportShipment 자동 생성', () => {
    const mockParsedLine = (overrides: Partial<Record<string, any>> = {}) => ({
      styleNo: 'STY-A',
      description: "WOMEN'S PANTS",
      qty: 10,
      unit: 'PCS',
      unitPrice: 1,
      amount: 10,
      invoiceHsCode: '62046300',
      netWeight: null,
      grossWeight: 2,
      packageCount: null,
      ...overrides,
    });

    beforeEach(() => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue({ styleNo: 'exists' });
      (shipmentRepo.findOne as jest.Mock).mockImplementation(() =>
        Promise.resolve({ id: 1, styleNo: 'STY-A', lines: [] }),
      );
    });

    it('마스터 매핑이 있고 인보이스 HS코드가 같으면 마스터 값을 그대로 쓰고 upsert는 호출되지 않는다', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: 'TYVN2026-34', invoiceDate: new Date('2026-09-11'), portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [mockParsedLine({ invoiceHsCode: '6204.63.0000' })],
        warnings: [],
      });
      (hsCodeService.findByStyle as jest.Mock).mockResolvedValue({
        id: 5,
        itemType: "WOMEN'S PANTS",
        fabricType: '직물',
        composition: 'POLYESTER 97%, POLYURETHANE 3%',
        hsCode: '6204.63.0000',
      });

      await service.importFromFile(Buffer.from(''));

      expect(hsCodeService.upsertOne).not.toHaveBeenCalled();
      expect(lineRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemType: "WOMEN'S PANTS",
          composition: 'POLYESTER 97%, POLYURETHANE 3%',
          fabricType: '직물',
          hsCode: '6204.63.0000',
        }),
      );
    });

    it('마스터 매핑이 있고 인보이스 HS코드가 다르면 인보이스 값으로 갱신하고 upsertOne/upsertStyleMapping을 호출하며 warnings를 남긴다', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: null, invoiceDate: null, portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [mockParsedLine({ invoiceHsCode: '62046300' })],
        warnings: [],
      });
      (hsCodeService.findByStyle as jest.Mock).mockResolvedValue({
        id: 5,
        itemType: "WOMEN'S PANTS",
        fabricType: '직물',
        composition: 'POLYESTER 97%, POLYURETHANE 3%',
        hsCode: '6204.53.0000', // 마스터 값이 인보이스와 다름
      });
      (hsCodeService.upsertOne as jest.Mock).mockResolvedValue({ id: 9 });

      const result = await service.importFromFile(Buffer.from(''));

      expect(hsCodeService.upsertOne).toHaveBeenCalledWith({
        itemType: "WOMEN'S PANTS",
        fabricType: '직물',
        composition: 'POLYESTER 97%, POLYURETHANE 3%',
        hsCode: '62046300',
      });
      expect(hsCodeService.upsertStyleMapping).toHaveBeenCalledWith('STY-A', 9);
      expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ hsCode: '62046300' }));
      expect(result.warnings.some((w) => w.includes('마스터 HS코드') && w.includes('인보이스 HS코드'))).toBe(true);
    });

    it('마스터 매핑이 없으면(NotFoundException) composition은 null로 저장하고 마스터에는 등록하지 않으며 warnings를 남긴다', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: null, invoiceDate: null, portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [mockParsedLine({ description: "WOMEN'S SKIRT", invoiceHsCode: '62045100' })],
        warnings: [],
      });
      (hsCodeService.findByStyle as jest.Mock).mockRejectedValue(new NotFoundException('no mapping'));

      const result = await service.importFromFile(Buffer.from(''));

      expect(hsCodeService.upsertOne).not.toHaveBeenCalled();
      expect(hsCodeService.upsertStyleMapping).not.toHaveBeenCalled();
      expect(lineRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ itemType: "WOMEN'S SKIRT", composition: null, hsCode: '62045100' }),
      );
      expect(result.warnings.some((w) => w.includes('신규 스타일'))).toBe(true);
    });

    it('MasterStyle에 없는 styleNo도 건너뛰지 않고 최소 스텁 MasterStyle을 만들어 전부 자료화하며, 정보성 warning만 남긴다(PR-124)', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: {
          invoiceNo: 'TYVN2026-99', invoiceDate: new Date(Date.UTC(2026, 6, 16)), portOfLoading: 'HAIPHONG, VIETNAM',
          finalDestination: 'INCHEON , KOREA', carrier: 'BY SEA', sailingDate: new Date(Date.UTC(2026, 6, 19)), vessel: 'STARSHIP TAURUS 2613N',
        },
        lines: [
          mockParsedLine({ styleNo: 'STY-EXISTS' }),
          mockParsedLine({ styleNo: 'STY-NEW', description: "WOMEN'S JACKET" }),
        ],
        warnings: [],
      });
      (masterStyleRepo.findOne as jest.Mock).mockImplementation((opts: any) =>
        Promise.resolve(opts.where.styleNo === 'STY-EXISTS' ? { styleNo: 'STY-EXISTS' } : null),
      );
      (hsCodeService.findByStyle as jest.Mock).mockRejectedValue(new NotFoundException('no mapping'));

      const result = await service.importFromFile(Buffer.from(''));

      expect(result.shipments).toHaveLength(2); // 이전에는 1건(STY-NEW 누락)
      expect(shipmentRepo.save).toHaveBeenCalledTimes(2);
      expect(masterStyleRepo.save).toHaveBeenCalledTimes(1);
      expect(masterStyleRepo.save).toHaveBeenCalledWith({ styleNo: 'STY-NEW' }); // 스텁: styleNo만, overview/BOM 없음
      expect(result.warnings.filter((w) => w.includes('STY-NEW') && w.includes('자동 등록'))).toHaveLength(1);
      expect(result.warnings.some((w) => w.includes('STY-EXISTS') && w.includes('자동 등록'))).toBe(false);
      expect(result.warnings.some((w) => w.includes('건너뛰'))).toBe(false);
    });

    it('파일 헤더의 POL/POD/ETD/선명이 저장되고, ETA는 채워지지 않는다(PR-124)', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: {
          invoiceNo: 'TYVN2026-99', invoiceDate: null, portOfLoading: 'HAIPHONG, VIETNAM', finalDestination: 'INCHEON , KOREA',
          carrier: null, sailingDate: new Date(Date.UTC(2026, 6, 19)), vessel: 'KJ374',
        },
        lines: [mockParsedLine({ styleNo: 'STY-A' })],
        warnings: [],
      });
      (hsCodeService.findByStyle as jest.Mock).mockRejectedValue(new NotFoundException('no mapping'));

      await service.importFromFile(Buffer.from(''));

      const created = (shipmentRepo.create as jest.Mock).mock.calls[0][0];
      expect(created).toMatchObject({ pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', vessel: 'KJ374' });
      expect(created.etd).toEqual(new Date(Date.UTC(2026, 6, 19)));
      expect(created.eta).toBeUndefined();
    });
  });

  // PR-124: 수동 등록도 미등록 스타일번호를 허용한다(find-or-create) + 선적 정보 저장/수정.
  describe('create — 미등록 스타일번호 허용 + 선적 정보 (PR-124)', () => {
    const dto = (over: any = {}) => ({ styleNo: 'NEW-STYLE', lines: [{ itemType: 'JK', qty: 1, unit: 'EA' }], ...over });
    beforeEach(() => {
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(null);
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({ id: 1, styleNo: 'NEW-STYLE', lines: [] });
    });

    it('스타일이 이미 있으면 새로 만들지 않고 styleAutoCreated=false', async () => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue({ styleNo: 'NEW-STYLE' });
      const result = await service.create(dto() as any);
      expect(masterStyleRepo.save).not.toHaveBeenCalled();
      expect(result.styleAutoCreated).toBe(false);
    });

    it('스타일이 없으면 styleNo만 가진 스텁을 만들고 styleAutoCreated=true(수입통관 문서도 정상 생성)', async () => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.create(dto() as any);
      expect(masterStyleRepo.save).toHaveBeenCalledWith({ styleNo: 'NEW-STYLE' });
      expect(shipmentRepo.save).toHaveBeenCalledTimes(1);
      expect(result.styleAutoCreated).toBe(true);
      // 스타일 생성이 문서 저장보다 먼저 일어난다(FK 순서)
      expect((masterStyleRepo.save as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((shipmentRepo.save as jest.Mock).mock.invocationCallOrder[0]);
    });

    it('동시에 다른 요청이 같은 스타일을 먼저 만들어 저장이 실패해도, 이미 있으면 그대로 진행한다', async () => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ styleNo: 'NEW-STYLE' });
      (masterStyleRepo.save as jest.Mock).mockRejectedValueOnce(new Error('duplicate key'));
      const result = await service.create(dto() as any);
      expect(result.styleAutoCreated).toBe(false);
      expect(shipmentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('스타일 저장이 실패했고 실제로도 없으면 에러를 그대로 던진다(문서는 만들지 않는다)', async () => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue(null);
      (masterStyleRepo.save as jest.Mock).mockRejectedValueOnce(new Error('db down'));
      await expect(service.create(dto() as any)).rejects.toThrow('db down');
      expect(shipmentRepo.save).not.toHaveBeenCalled();
    });

    it('POL/POD/ETD/ETA/선명을 저장하고, 비어 있는 값은 null로 정규화한다', async () => {
      await service.create(dto({ pol: ' HAIPHONG, VIETNAM ', pod: 'INCHEON , KOREA', etd: '2026-07-19', eta: '2026-07-24', vessel: '   ' }) as any);
      const created = (shipmentRepo.create as jest.Mock).mock.calls[0][0];
      expect(created).toMatchObject({ pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', vessel: null });
      expect(created.etd).toEqual(new Date('2026-07-19'));
      expect(created.eta).toEqual(new Date('2026-07-24'));
    });

    it('ETA가 ETD보다 빠르면 400이고 스타일도 문서도 만들지 않는다', async () => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.create(dto({ etd: '2026-07-19', eta: '2026-07-18' }) as any)).rejects.toThrow(BadRequestException);
      expect(masterStyleRepo.save).not.toHaveBeenCalled();
      expect(shipmentRepo.save).not.toHaveBeenCalled();
    });

    it('ETD만 또는 ETA만 있어도 정상(ETA는 선택 입력)', async () => {
      await expect(service.create(dto({ etd: '2026-07-19' }) as any)).resolves.toBeDefined();
      await expect(service.create(dto({ eta: '2026-07-24' }) as any)).resolves.toBeDefined();
    });
  });

  describe('updateHeader — 선적 일정/경로 수정 (PR-124)', () => {
    const current = (over: any = {}) => ({ id: 1, styleNo: 'S', pol: 'A', pod: 'B', etd: new Date('2026-07-19'), eta: null, vessel: 'V', lines: [], ...over });
    beforeEach(() => (shipmentRepo.findOne as jest.Mock).mockResolvedValue(current()));

    it('보낸 필드만 바꾸고 나머지는 그대로 둔다', async () => {
      await service.updateHeader(1, { pod: 'INCHEON , KOREA', eta: '2026-07-24' });
      expect(shipmentRepo.update).toHaveBeenCalledWith(1, { pod: 'INCHEON , KOREA', eta: new Date('2026-07-24') });
    });

    it('null 또는 빈 문자열은 값을 지운다', async () => {
      await service.updateHeader(1, { pod: null, vessel: '  ', etd: null });
      expect(shipmentRepo.update).toHaveBeenCalledWith(1, { pod: null, vessel: null, etd: null });
    });

    it('새 ETA가 기존 ETD보다 빠르면 400(기존 값과 함께 검증), ETD를 함께 바꾸면 새 값으로 검증', async () => {
      await expect(service.updateHeader(1, { eta: '2026-07-01' })).rejects.toThrow(BadRequestException);
      expect(shipmentRepo.update).not.toHaveBeenCalled();
      await expect(service.updateHeader(1, { etd: '2026-06-01', eta: '2026-07-01' })).resolves.toBeDefined();
    });

    it('없는 문서는 404', async () => {
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.updateHeader(999, { pod: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // PR-102: 스타일번호/자재명(itemType)/선적건번호(invoiceNo) 검색 필터.
  describe('findAll — 검색 필터 (PR-102)', () => {
    const buildQueryBuilder = (matchedIds: number[]) => {
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(matchedIds.map((id) => ({ id }))),
      };
      return qb;
    };

    it('필터를 아무것도 지정하지 않으면 find()로 전체를 조회한다(쿼리빌더 안 씀)', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([]);

      await service.findAll({});

      expect(shipmentRepo.find).toHaveBeenCalledTimes(1);
      expect(shipmentRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('styleNo만 지정하면 shipment.styleNo LIKE 조건만 걸린다(라인 조인 불필요)', async () => {
      const qb = buildQueryBuilder([1]);
      (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 1, lines: [] }]);

      await service.findAll({ styleNo: 'MB62' });

      expect(qb.andWhere).toHaveBeenCalledWith('shipment.styleNo LIKE :styleNo', { styleNo: '%MB62%' });
      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('itemType'), expect.anything());
    });

    it('materialName만 지정하면 line.itemType LIKE 조건만 걸린다', async () => {
      const qb = buildQueryBuilder([2]);
      (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 2, lines: [] }]);

      await service.findAll({ materialName: '원단' });

      expect(qb.andWhere).toHaveBeenCalledWith('line.itemType LIKE :materialName', { materialName: '%원단%' });
    });

    it('sheetNo만 지정하면 shipment.invoiceNo LIKE 조건만 걸린다', async () => {
      const qb = buildQueryBuilder([3]);
      (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 3, lines: [] }]);

      await service.findAll({ sheetNo: 'TYVN2026' });

      expect(qb.andWhere).toHaveBeenCalledWith('shipment.invoiceNo LIKE :sheetNo', { sheetNo: '%TYVN2026%' });
    });

    it('styleNo+materialName을 함께 지정하면 둘 다 andWhere로 걸린다(AND 결합, 조합 가능)', async () => {
      const qb = buildQueryBuilder([1]);
      (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 1, lines: [] }]);

      await service.findAll({ styleNo: 'MB62', materialName: '원단' });

      expect(qb.andWhere).toHaveBeenCalledWith('shipment.styleNo LIKE :styleNo', { styleNo: '%MB62%' });
      expect(qb.andWhere).toHaveBeenCalledWith('line.itemType LIKE :materialName', { materialName: '%원단%' });
    });

    it('매칭되는 id가 없으면 빈 배열을 반환하고 find()를 호출하지 않는다', async () => {
      const qb = buildQueryBuilder([]);
      (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({ styleNo: 'NO-MATCH' });

      expect(result).toEqual([]);
      expect(shipmentRepo.find).not.toHaveBeenCalled();
    });
  });

  // PR-111: 스타일번호 접두사로 브랜드를 계산해 붙이고, brand 필터가 있으면
  // 조회 시점(메모리)에서 걸러낸다 — SQL 필터(styleNo/materialName/sheetNo)와
  // 조합되지 않는 경로(필터 없음)에서도 동일하게 동작해야 한다.
  describe('findAll — 브랜드 분류/필터 (PR-111)', () => {
    beforeEach(() => {
      mockBrandPrefixRulesService.findAll.mockResolvedValue([
        { prefix: 'BF', isNumericStart: false, brandName: '빈폴' },
        { prefix: 'MB', isNumericStart: false, brandName: '미센스' },
      ]);
    });

    it('필터 없이 조회해도 각 shipment에 접두사로 계산한 brand가 붙는다', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([
        { id: 1, styleNo: 'BF6821C13', lines: [] },
        { id: 2, styleNo: 'MB6YHMP104Z', lines: [] },
        { id: 3, styleNo: 'ZZ9999', lines: [] },
      ]);

      const result = await service.findAll({});

      expect(result.map((r) => r.brand)).toEqual(['빈폴', '미센스', null]);
    });

    it('brand 필터를 지정하면 해당 브랜드만 반환한다', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([
        { id: 1, styleNo: 'BF6821C13', lines: [] },
        { id: 2, styleNo: 'MB6YHMP104Z', lines: [] },
      ]);

      const result = await service.findAll({ brand: '빈폴' });

      expect(result).toHaveLength(1);
      expect(result[0].styleNo).toBe('BF6821C13');
    });
  });

  // PR-112: DPKL 시트 파싱 결과를 같은 업로드에서 만든 여러 ImportShipment에 styleNo
  // 기준으로 나눠 source=EXCEL로 저장한다.
  describe('importFromFile — DPKL 상세포장내역 배분 (PR-112)', () => {
    const line = (styleNo: string) => ({
      styleNo, description: 'D', qty: 1, unit: 'PCS', unitPrice: 1, amount: 1,
      invoiceHsCode: null, netWeight: null, grossWeight: null, packageCount: null,
    });
    const header = { invoiceNo: 'T', invoiceDate: null, portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null };

    beforeEach(() => {
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue({ styleNo: 'exists' });
      (shipmentRepo.findOne as jest.Mock).mockImplementation(() => Promise.resolve({ id: 1, styleNo: 'A', lines: [] }));
      (hsCodeService.findByStyle as jest.Mock).mockRejectedValue(new NotFoundException('none'));
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header,
        lines: [line('A'), line('B')],
        warnings: [],
      });
    });

    it('스타일별 상세내역을 각 shipment에 source=EXCEL로 배분한다', async () => {
      (ImportShipmentPackingDetailExcelParser.parse as jest.Mock).mockReturnValue({
        sheetName: '적재순',
        rows: [
          { styleNo: 'A', color: 'BK', size: 'S', qty: 3 },
          { styleNo: 'B', color: 'RD', size: 'M', qty: 5 },
          { styleNo: 'A', color: 'BK', size: 'M', qty: 4 },
        ],
      });

      await service.importFromFile(Buffer.from(''));

      expect(mockPackingDetailsService.createMany).toHaveBeenCalledTimes(2);
      expect(mockPackingDetailsService.createMany).toHaveBeenNthCalledWith(
        1, 1,
        { details: [{ color: 'BK', size: 'S', qty: 3 }, { color: 'BK', size: 'M', qty: 4 }] },
        ImportShipmentPackingDetailSource.EXCEL,
      );
      expect(mockPackingDetailsService.createMany).toHaveBeenNthCalledWith(
        2, 1,
        { details: [{ color: 'RD', size: 'M', qty: 5 }] },
        ImportShipmentPackingDetailSource.EXCEL,
      );
    });

    it('DPKL 시트가 없으면 에러 없이 건너뛴다', async () => {
      (ImportShipmentPackingDetailExcelParser.parse as jest.Mock).mockReturnValue(null);

      const result = await service.importFromFile(Buffer.from(''));

      expect(mockPackingDetailsService.createMany).not.toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes('상세포장내역'))).toBe(false);
    });

    it('DPKL에만 있고 이번 업로드로 shipment가 만들어지지 않은 스타일은 warnings로 알린다', async () => {
      (ImportShipmentPackingDetailExcelParser.parse as jest.Mock).mockReturnValue({
        sheetName: '품번별',
        rows: [{ styleNo: 'ZZ', color: 'BK', size: 'S', qty: 1 }],
      });

      const result = await service.importFromFile(Buffer.from(''));

      expect(mockPackingDetailsService.createMany).not.toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes('ZZ'))).toBe(true);
    });
  });

  // PR-152: INVOICE/Packing List(invoiceNo) 단위 일괄 통관완료처리.
  describe('bulkClear — INV/PKL 단위 일괄 통관완료처리 (PR-152)', () => {
    const shipment = (id: number, status: ImportShipmentStatus, invoiceNo = 'TYVN2026-26') => ({
      id, invoiceNo, status, clearedAt: null,
    });

    it('invoiceNo로 PENDING_CLEARANCE 건만 CLEARED로 바뀌고, 이미 CLEARED인 건은 건너뛴다', async () => {
      const s1 = shipment(1, ImportShipmentStatus.PENDING_CLEARANCE);
      const s2 = shipment(2, ImportShipmentStatus.PENDING_CLEARANCE);
      const s3 = shipment(3, ImportShipmentStatus.CLEARED);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([s1, s2, s3]);

      const result = await service.bulkClear({ invoiceNo: 'TYVN2026-26' });

      expect(shipmentRepo.find).toHaveBeenCalledWith({ where: { invoiceNo: 'TYVN2026-26' } });
      expect(result.clearedCount).toBe(2);
      expect(result.clearedIds.sort()).toEqual([1, 2]);
      expect(result.skippedAlreadyClearedCount).toBe(1);
      expect(result.skippedAlreadyClearedIds).toEqual([3]);
      expect(mockQueryRunnerManager.save).toHaveBeenCalledTimes(2); // CLEARED였던 s3는 save 대상 아님
      expect(s1.status).toBe(ImportShipmentStatus.CLEARED);
      expect((s1 as any).clearedAt).not.toBeNull();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('ids로도 지정할 수 있다(invoiceNo 없이)', async () => {
      const s1 = shipment(1, ImportShipmentStatus.PENDING_CLEARANCE);
      (shipmentRepo.find as jest.Mock).mockResolvedValue([s1]);

      const result = await service.bulkClear({ ids: [1] });

      const calledWith = (shipmentRepo.find as jest.Mock).mock.calls[0][0];
      expect(calledWith.where.id.value).toEqual([1]); // TypeORM In() 연산자 내부 표현
      expect(result.invoiceNo).toBeNull();
      expect(result.clearedCount).toBe(1);
    });

    it('invoiceNo와 ids가 둘 다 있으면 invoiceNo를 우선한다', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([shipment(1, ImportShipmentStatus.PENDING_CLEARANCE)]);

      await service.bulkClear({ invoiceNo: 'TYVN2026-26', ids: [999] });

      expect(shipmentRepo.find).toHaveBeenCalledWith({ where: { invoiceNo: 'TYVN2026-26' } });
    });

    it('둘 다 없으면 400', async () => {
      await expect(service.bulkClear({})).rejects.toBeInstanceOf(BadRequestException);
      expect(shipmentRepo.find).not.toHaveBeenCalled();
    });

    it('존재하지 않는 invoiceNo면 404', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([]);
      await expect(service.bulkClear({ invoiceNo: 'NO-SUCH-INVOICE' })).rejects.toBeInstanceOf(NotFoundException);
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('전부 이미 CLEARED면 성공하지만 clearedCount는 0이고 아무것도 저장하지 않는다', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([shipment(1, ImportShipmentStatus.CLEARED)]);

      const result = await service.bulkClear({ invoiceNo: 'TYVN2026-26' });

      expect(result.clearedCount).toBe(0);
      expect(result.skippedAlreadyClearedCount).toBe(1);
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('저장 도중 실패하면 롤백하고 에러를 그대로 던진다', async () => {
      (shipmentRepo.find as jest.Mock).mockResolvedValue([shipment(1, ImportShipmentStatus.PENDING_CLEARANCE)]);
      mockQueryRunnerManager.save.mockRejectedValue(new Error('DB down'));

      await expect(service.bulkClear({ invoiceNo: 'TYVN2026-26' })).rejects.toThrow('DB down');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });
});
