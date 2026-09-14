import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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

  describe('importFromFile — 엑셀 업로드로 스타일별 ImportShipment 자동 생성', () => {
    it('여러 스타일이 섞인 파일을 styleNo별로 그룹핑해 각각 별도 ImportShipment을 생성한다', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: 'TYVN-SF-08-2026', invoiceDate: new Date('2026-09-15'), portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [
          { styleNo: 'STY-A', itemType: "WOMEN'S PANTS", composition: 'COTTON 100%', qty: 10, unit: 'PCS', unitPrice: 1, amount: 10, netWeight: 1, grossWeight: 2, packageCount: 1 },
          { styleNo: 'STY-B', itemType: "WOMEN'S JACKET", composition: 'WOOL 100%', qty: 5, unit: 'PCS', unitPrice: 2, amount: 10, netWeight: 1, grossWeight: 2, packageCount: 1 },
        ],
        warnings: [],
      });
      (masterStyleRepo.findOne as jest.Mock).mockResolvedValue({ styleNo: 'exists' });
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(null);
      (shipmentRepo.findOne as jest.Mock).mockImplementation((opts: any) =>
        Promise.resolve({ id: opts.where.id, styleNo: 'X', lines: [] }),
      );

      const result = await service.importFromFile(Buffer.from(''));

      expect(masterStyleRepo.findOne).toHaveBeenCalledWith({ where: { styleNo: 'STY-A' } });
      expect(masterStyleRepo.findOne).toHaveBeenCalledWith({ where: { styleNo: 'STY-B' } });
      expect(shipmentRepo.save).toHaveBeenCalledTimes(2);
      expect(result.shipments).toHaveLength(2);
      expect(result.warnings).toEqual([]);
    });

    it('MasterStyle에 없는 styleNo는 건너뛰고 warnings에 남긴다(나머지는 계속 생성)', async () => {
      (ImportShipmentExcelParser.parse as jest.Mock).mockReturnValue({
        header: { invoiceNo: null, invoiceDate: null, portOfLoading: null, finalDestination: null, carrier: null, sailingDate: null },
        lines: [
          { styleNo: 'STY-EXISTS', itemType: "WOMEN'S PANTS", composition: 'COTTON 100%', qty: 10, unit: 'PCS', unitPrice: 1, amount: 10, netWeight: 1, grossWeight: 2, packageCount: 1 },
          { styleNo: 'STY-TYPO', itemType: "WOMEN'S JACKET", composition: 'WOOL 100%', qty: 5, unit: 'PCS', unitPrice: 2, amount: 10, netWeight: 1, grossWeight: 2, packageCount: 1 },
        ],
        warnings: [],
      });
      (masterStyleRepo.findOne as jest.Mock).mockImplementation((opts: any) =>
        Promise.resolve(opts.where.styleNo === 'STY-EXISTS' ? { styleNo: 'STY-EXISTS' } : null),
      );
      (hsCodeService.findMatch as jest.Mock).mockResolvedValue(null);
      (shipmentRepo.findOne as jest.Mock).mockResolvedValue({ id: 1, styleNo: 'STY-EXISTS', lines: [] });

      const result = await service.importFromFile(Buffer.from(''));

      expect(result.shipments).toHaveLength(1);
      expect(result.warnings.some((w) => w.includes('STY-TYPO'))).toBe(true);
      expect(shipmentRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
