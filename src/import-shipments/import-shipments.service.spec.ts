import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipment, ImportShipmentStatus } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { HsCodeClassificationsService } from '../hs-code-classifications/hs-code-classifications.service';
import { ImportShipmentExcelParser } from './utils/import-shipment-excel-parser.util';

jest.mock('./utils/import-shipment-excel-parser.util');

describe('ImportShipmentsService', () => {
  let service: ImportShipmentsService;
  let shipmentRepo: Repository<ImportShipment>;
  let lineRepo: Repository<ImportShipmentLine>;
  let masterStyleRepo: Repository<MasterStyle>;
  let hsCodeService: HsCodeClassificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportShipmentsService,
        {
          provide: getRepositoryToken(ImportShipment),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
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
            findOne: jest.fn(),
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

    it('MasterStyle에 없는 styleNo는 건너뛰고 warnings에 남긴다(나머지는 계속 생성)', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: null, invoiceDate: null, portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [
          mockParsedLine({ styleNo: 'STY-EXISTS' }),
          mockParsedLine({ styleNo: 'STY-TYPO', description: "WOMEN'S JACKET" }),
        ],
        warnings: [],
      });
      (masterStyleRepo.findOne as jest.Mock).mockImplementation((opts: any) =>
        Promise.resolve(opts.where.styleNo === 'STY-EXISTS' ? { styleNo: 'STY-EXISTS' } : null),
      );
      (hsCodeService.findByStyle as jest.Mock).mockRejectedValue(new NotFoundException('no mapping'));

      const result = await service.importFromFile(Buffer.from(''));

      expect(result.shipments).toHaveLength(1);
      expect(result.warnings.some((w) => w.includes('STY-TYPO'))).toBe(true);
      expect(shipmentRepo.save).toHaveBeenCalledTimes(1);
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
});
