import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { ImportShipmentPackingDetail } from '../import-shipments/entities/import-shipment-packing-detail.entity';
import { ImportShipment } from '../import-shipments/entities/import-shipment.entity';

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;

  const mockGoodsReceiptRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn(),
  };
  const mockGoodsReceiptLineRepository = {};
  const mockPackingDetailRepository = { findOne: jest.fn() };
  const mockImportShipmentRepository = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGoodsReceiptRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: getRepositoryToken(GoodsReceipt), useValue: mockGoodsReceiptRepository },
        { provide: getRepositoryToken(GoodsReceiptLine), useValue: mockGoodsReceiptLineRepository },
        { provide: getRepositoryToken(ImportShipmentPackingDetail), useValue: mockPackingDetailRepository },
        { provide: getRepositoryToken(ImportShipment), useValue: mockImportShipmentRepository },
      ],
    }).compile();

    service = module.get(GoodsReceiptsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('존재하지 않는 importShipmentId면 NotFoundException을 던진다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({ importShipmentId: 999, lines: [{ packingDetailId: 1 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('존재하지 않는 packingDetailId면 NotFoundException을 던진다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockPackingDetailRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({ importShipmentId: 1, lines: [{ packingDetailId: 999 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('조정 없이(수량 미지정) 생성하면 원 수량 그대로 라인이 만들어진다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockPackingDetailRepository.findOne.mockResolvedValue({
        id: 10,
        importShipmentId: 1,
        styleNo: 'STYLE-A',
        color: '4',
        size: 'L',
        qty: 100,
      });
      mockGoodsReceiptRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));
      mockGoodsReceiptRepository.findOne.mockResolvedValue({ id: 1, lines: [] });

      await service.create({ importShipmentId: 1, lines: [{ packingDetailId: 10 }] });

      const savedArg = mockGoodsReceiptRepository.save.mock.calls[0][0];
      expect(savedArg.lines[0]).toMatchObject({ originalQty: 100, adjustedQty: 100, adjustmentReason: null });
    });

    it('조정 수량과 사유를 함께 주면 그대로 저장된다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockPackingDetailRepository.findOne.mockResolvedValue({
        id: 10,
        importShipmentId: 1,
        styleNo: 'STYLE-A',
        color: '4',
        size: 'L',
        qty: 100,
      });
      mockGoodsReceiptRepository.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));
      mockGoodsReceiptRepository.findOne.mockResolvedValue({ id: 1, lines: [] });

      await service.create({
        importShipmentId: 1,
        lines: [{ packingDetailId: 10, adjustedQty: 95, adjustmentReason: '샘플 출고 5장' }],
      });

      const savedArg = mockGoodsReceiptRepository.save.mock.calls[0][0];
      expect(savedArg.lines[0]).toMatchObject({
        originalQty: 100,
        adjustedQty: 95,
        adjustmentReason: '샘플 출고 5장',
      });
    });

    it('조정 수량이 원 수량과 다른데 사유가 없으면 400이다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockPackingDetailRepository.findOne.mockResolvedValue({
        id: 10,
        importShipmentId: 1,
        styleNo: 'STYLE-A',
        color: '4',
        size: 'L',
        qty: 100,
      });

      await expect(
        service.create({ importShipmentId: 1, lines: [{ packingDetailId: 10, adjustedQty: 95 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockGoodsReceiptRepository.save).not.toHaveBeenCalled();
    });

    it('다른 shipment 소속인 packingDetail을 참조하면 NotFoundException을 던진다', async () => {
      mockImportShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockPackingDetailRepository.findOne.mockResolvedValue({ id: 10, importShipmentId: 2 });

      await expect(
        service.create({ importShipmentId: 1, lines: [{ packingDetailId: 10 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOneOrFail', () => {
    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      mockGoodsReceiptRepository.findOne.mockResolvedValue(null);
      await expect(service.findOneOrFail(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
