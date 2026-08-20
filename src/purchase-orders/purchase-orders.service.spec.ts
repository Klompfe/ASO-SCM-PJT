import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let poRepository: Repository<PurchaseOrder>;
  let dataSource: DataSource;

  const mockPoRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockDataSource = () => ({
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useFactory: mockPoRepository,
        },
        {
          provide: DataSource,
          useFactory: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    poRepository = module.get(getRepositoryToken(PurchaseOrder));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('새로운 발주서를 성공적으로 생성해야 한다', async () => {
      const dto = { itemId: 1, quantity: 10 };
      const expectedPo = {
        id: 1,
        itemId: 1,
        quantity: 10,
        status: PurchaseOrderStatus.PENDING,
      };

      jest.spyOn(poRepository, 'create').mockReturnValue(expectedPo as any);
      jest.spyOn(poRepository, 'save').mockResolvedValue(expectedPo as any);

      const result = await service.create(dto);
      expect(result).toEqual(expectedPo);
    });
  });

  describe('findOne', () => {
    it('존재하는 발주서를 조회해야 한다', async () => {
      const expectedPo = { id: 1, itemId: 1, quantity: 10, status: PurchaseOrderStatus.PENDING };
      jest.spyOn(poRepository, 'findOne').mockResolvedValue(expectedPo as any);

      const result = await service.findOne(1);
      expect(result).toEqual(expectedPo);
    });

    it('존재하지 않는 발주서 조회 시 NotFoundException 발생', async () => {
      jest.spyOn(poRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('PENDING 상태인 발주서를 CANCELLED로 변경해야 한다', async () => {
      const po = { id: 1, itemId: 1, quantity: 10, status: PurchaseOrderStatus.PENDING };

      mockQueryRunner.manager.findOne.mockResolvedValue(po);
      mockQueryRunner.manager.save.mockImplementation(async (entity) => entity);

      const result = await service.cancel(1);
      expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    });

    it('이미 RECEIVED 상태인 발주서 취소 시 BadRequestException 발생', async () => {
      const po = { id: 1, itemId: 1, quantity: 10, status: PurchaseOrderStatus.RECEIVED };

      mockQueryRunner.manager.findOne.mockResolvedValue(po);

      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });
  });
});