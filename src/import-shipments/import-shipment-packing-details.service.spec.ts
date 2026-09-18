import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportShipmentPackingDetailsService } from './import-shipment-packing-details.service';
import { ImportShipment } from './entities/import-shipment.entity';
import { ImportShipmentPackingDetail } from './entities/import-shipment-packing-detail.entity';
import { GoodsReceiptLine } from '../goods-receipts/entities/goods-receipt-line.entity';

describe('ImportShipmentPackingDetailsService', () => {
  let service: ImportShipmentPackingDetailsService;

  const mockShipmentRepository = { findOne: jest.fn() };
  const mockDetailRepository = {
    create: jest.fn((data: any) => data),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const mockGoodsReceiptLineRepository = { find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportShipmentPackingDetailsService,
        { provide: getRepositoryToken(ImportShipment), useValue: mockShipmentRepository },
        { provide: getRepositoryToken(ImportShipmentPackingDetail), useValue: mockDetailRepository },
        { provide: getRepositoryToken(GoodsReceiptLine), useValue: mockGoodsReceiptLineRepository },
      ],
    }).compile();

    service = module.get(ImportShipmentPackingDetailsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMany', () => {
    it('존재하는 shipment면 styleNo를 그대로 복사해 여러 건 생성한다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockDetailRepository.save.mockImplementation((rows: any) => Promise.resolve(rows));

      const result = await service.createMany(1, {
        details: [
          { color: '4', size: 'L', qty: 100 },
          { color: '4', size: 'M', qty: 80 },
        ],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ importShipmentId: 1, styleNo: 'STYLE-A', color: '4', size: 'L', qty: 100 });
    });

    it('존재하지 않는 shipment면 NotFoundException을 던진다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue(null);
      await expect(
        service.createMany(999, { details: [{ color: '4', size: 'L', qty: 100 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAllByShipment', () => {
    it('입고증 라인이 참조 중인 상세내역은 hasReceipt:true로 표시한다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockDetailRepository.find.mockResolvedValue([
        { id: 10, importShipmentId: 1, color: '4', size: 'L', qty: 100 },
        { id: 11, importShipmentId: 1, color: '4', size: 'M', qty: 80 },
      ]);
      mockGoodsReceiptLineRepository.find.mockResolvedValue([{ packingDetailId: 10 }]);

      const result = await service.findAllByShipment(1);
      expect(result.find((d) => d.id === 10)!.hasReceipt).toBe(true);
      expect(result.find((d) => d.id === 11)!.hasReceipt).toBe(false);
    });

    it('상세내역이 없으면 빈 배열을 반환하고 GoodsReceiptLine 조회는 하지 않는다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue({ id: 1, styleNo: 'STYLE-A' });
      mockDetailRepository.find.mockResolvedValue([]);

      const result = await service.findAllByShipment(1);
      expect(result).toEqual([]);
      expect(mockGoodsReceiptLineRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('다른 shipment 소속이면 NotFoundException을 던진다', async () => {
      mockDetailRepository.findOne.mockResolvedValue({ id: 10, importShipmentId: 2 });
      await expect(service.update(1, 10, { qty: 50 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('qty만 지정하면 color/size는 그대로 유지된다', async () => {
      const existing = { id: 10, importShipmentId: 1, color: '4', size: 'L', qty: 100 };
      mockDetailRepository.findOne.mockResolvedValue(existing);
      mockDetailRepository.save.mockImplementation((entity: any) => Promise.resolve(entity));

      const result = await service.update(1, 10, { qty: 90 });
      expect(result).toMatchObject({ color: '4', size: 'L', qty: 90 });
    });
  });

  describe('remove', () => {
    it('이미 입고증 라인이 참조 중이면 BadRequestException을 던지고 삭제하지 않는다', async () => {
      mockDetailRepository.findOne.mockResolvedValue({ id: 10, importShipmentId: 1 });
      mockGoodsReceiptLineRepository.findOne.mockResolvedValue({ id: 1, goodsReceiptId: 5, packingDetailId: 10 });

      await expect(service.remove(1, 10)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDetailRepository.remove).not.toHaveBeenCalled();
    });

    it('참조 중인 라인이 없으면 정상 삭제된다', async () => {
      const existing = { id: 10, importShipmentId: 1 };
      mockDetailRepository.findOne.mockResolvedValue(existing);
      mockGoodsReceiptLineRepository.findOne.mockResolvedValue(null);

      await service.remove(1, 10);
      expect(mockDetailRepository.remove).toHaveBeenCalledWith(existing);
    });
  });
});
