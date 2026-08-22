import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let poRepository: Repository<PurchaseOrder>;
  let dataSource: DataSource;

  const mockPoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: mockPoRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    poRepository = module.get<Repository<PurchaseOrder>>(getRepositoryToken(PurchaseOrder));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('발주서를 정상적으로 생성해야 한다', async () => {
      const dto: CreatePurchaseOrderDto = {
        supplierId: 1,
        itemId: 1,
        quantity: 100,
      };

      const mockSupplier = { id: 1, name: '테스트 공급사' };
      const mockItem = { id: 1, name: '테스트 품목' };
      const expectedPo = { id: 1, ...dto, supplier: mockSupplier, item: mockItem };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockImplementation(({ where }) => {
          if (where.id === dto.supplierId) return Promise.resolve(mockSupplier);
          if (where.id === dto.itemId) return Promise.resolve(mockItem);
          return Promise.resolve(null);
        }),
      });

      jest.spyOn(poRepository, 'create').mockReturnValue(expectedPo as any);
      jest.spyOn(poRepository, 'save').mockResolvedValue(expectedPo as any);

      const result = await service.create(dto);
      expect(result).toEqual(expectedPo);
    });
  });

  describe('cancel', () => {
    it('발주서를 취소해야 한다', async () => {
      const po = { id: 1, status: 'PENDING' };
      const cancelledPo = { id: 1, status: 'CANCELLED' };

      jest.spyOn(service, 'findOne').mockResolvedValue(po as any);
      jest.spyOn(poRepository, 'save').mockResolvedValue(cancelledPo as any);

      const result = await service.cancel(1);
      expect(result.status).toEqual('CANCELLED');
    });

    it('이미 완료되거나 취소된 발주는 취소할 수 없다', async () => {
      const po = { id: 1, status: 'DELIVERED' };
      jest.spyOn(service, 'findOne').mockResolvedValue(po as any);

      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });
  });
});