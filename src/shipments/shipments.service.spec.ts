import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';

describe('ShipmentsService', () => {
  let service: ShipmentsService;
  let shipmentRepository: Repository<Shipment>;

  const mockShipmentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        {
          provide: getRepositoryToken(Shipment),
          useValue: mockShipmentRepository,
        },
      ],
    }).compile();

    service = module.get<ShipmentsService>(ShipmentsService);
    shipmentRepository = module.get<Repository<Shipment>>(getRepositoryToken(Shipment));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('출하를 정상적으로 생성해야 한다', async () => {
      const dto: CreateShipmentDto = {
        shipmentNumber: 'SHIP-001',
        carrierName: 'DHL',
        trackingNumber: 'TRK-123',
      };
      const expected = { id: 1, ...dto, status: ShipmentStatus.SHIPPING };

      mockShipmentRepository.create.mockReturnValue(expected);
      mockShipmentRepository.save.mockResolvedValue(expected);

      const result = await service.create(dto);

      expect(mockShipmentRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('전체 출하 목록을 id DESC로 조회해야 한다', async () => {
      const list = [{ id: 2 }, { id: 1 }];
      mockShipmentRepository.find.mockResolvedValue(list);

      const result = await service.findAll();

      expect(mockShipmentRepository.find).toHaveBeenCalledWith({ order: { id: 'DESC' } });
      expect(result).toEqual(list);
    });
  });

  describe('findOne', () => {
    it('존재하는 출하를 조회해야 한다', async () => {
      const shipment = { id: 1, shipmentNumber: 'SHIP-001' };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);

      const result = await service.findOne(1);
      expect(result).toEqual(shipment);
    });

    it('존재하지 않는 출하 조회 시 NotFoundException을 던져야 한다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('SHIPPING -> DELIVERED 전이가 정상 동작해야 한다', async () => {
      const shipment = { id: 1, status: ShipmentStatus.SHIPPING };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);
      mockShipmentRepository.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.updateStatus(1, { status: ShipmentStatus.DELIVERED });

      expect(result.status).toBe(ShipmentStatus.DELIVERED);
      expect(mockShipmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ShipmentStatus.DELIVERED }),
      );
    });

    it('이미 DELIVERED인 출하는 재전이 시도 시 BadRequestException을 던지고 저장하지 않아야 한다', async () => {
      const shipment = { id: 1, status: ShipmentStatus.DELIVERED };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);

      await expect(
        service.updateStatus(1, { status: ShipmentStatus.DELIVERED }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockShipmentRepository.save).not.toHaveBeenCalled();
    });

    it('DELIVERED에서 SHIPPING으로의 역방향 전이도 차단해야 한다', async () => {
      const shipment = { id: 1, status: ShipmentStatus.DELIVERED };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);

      await expect(
        service.updateStatus(1, { status: ShipmentStatus.SHIPPING }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockShipmentRepository.save).not.toHaveBeenCalled();
    });

    it('SHIPPING 상태에서 SHIPPING으로의 동일 상태 재요청도 차단해야 한다(허용된 전이는 SHIPPING->DELIVERED뿐)', async () => {
      const shipment = { id: 1, status: ShipmentStatus.SHIPPING };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);

      await expect(
        service.updateStatus(1, { status: ShipmentStatus.SHIPPING }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockShipmentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('출하를 삭제해야 한다', async () => {
      const shipment = { id: 1, shipmentNumber: 'SHIP-001' };
      mockShipmentRepository.findOne.mockResolvedValue(shipment);
      mockShipmentRepository.remove.mockResolvedValue(shipment);

      await service.remove(1);

      expect(mockShipmentRepository.remove).toHaveBeenCalledWith(shipment);
    });

    it('존재하지 않는 출하 삭제 시 NotFoundException을 던져야 한다', async () => {
      mockShipmentRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
