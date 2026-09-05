import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventories/entities/inventory.entity';

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
    getRepository: jest.fn(),
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    options: { type: 'postgres' }, // 프로덕션 대상(Postgres) 기준으로 pessimistic_write 분기를 검증
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockQueryRunnerManager.save.mockImplementation((_entity: any, data: any) => Promise.resolve(data));
    mockQueryRunnerManager.create.mockImplementation((_entity: any, data: any) => data);

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
        unitPrice: 12.5,
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

  describe('updateStatus - RECEIVED (Inventory 자동 반영)', () => {
    it('해당 품목의 Inventory가 없으면 새로 생성되고 quantity가 PO.quantity와 같아야 한다', async () => {
      const po = { id: 1, itemId: 100, quantity: 50, status: PurchaseOrderStatus.PENDING };

      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return Promise.resolve({ ...po });
        if (entity === Inventory) return Promise.resolve(null); // 기존 Inventory 없음
        return Promise.resolve(null);
      });

      const result = await service.updateStatus(1, { status: PurchaseOrderStatus.RECEIVED });

      expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);

      const inventorySave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Inventory);
      expect(inventorySave[1]).toEqual(expect.objectContaining({ itemId: 100, quantity: 50 }));

      const inventoryFindOne = mockQueryRunnerManager.findOne.mock.calls.find(([entity]: any) => entity === Inventory);
      expect(inventoryFindOne[1]).toEqual(
        expect.objectContaining({ where: { itemId: 100 }, lock: { mode: 'pessimistic_write' } }),
      );

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('해당 품목의 Inventory가 이미 있으면 quantity가 정확히 더해져야 한다', async () => {
      const po = { id: 2, itemId: 200, quantity: 30, status: PurchaseOrderStatus.PENDING };
      const existingInventory = { id: 9, itemId: 200, quantity: 70 };

      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return Promise.resolve({ ...po });
        if (entity === Inventory) return Promise.resolve({ ...existingInventory });
        return Promise.resolve(null);
      });

      const result = await service.updateStatus(2, { status: PurchaseOrderStatus.RECEIVED });

      expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);

      const inventorySave = mockQueryRunnerManager.save.mock.calls.find(([entity]: any) => entity === Inventory);
      expect(inventorySave[1].quantity).toBe(100); // 기존 70 + 입고 30

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('이미 RECEIVED이거나 CANCELLED인 PO를 다시 RECEIVED로 바꾸려 하면 예외가 발생하고 재고는 변하지 않아야 한다', async () => {
      const receivedPo = { id: 3, itemId: 300, quantity: 10, status: PurchaseOrderStatus.RECEIVED };

      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return Promise.resolve({ ...receivedPo });
        return Promise.resolve(null);
      });

      await expect(service.updateStatus(3, { status: PurchaseOrderStatus.RECEIVED })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled(); // 재고/PO 저장 자체가 없어야 함(불변)
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);

      // CANCELLED 상태에서도 동일하게 막혀야 한다
      jest.clearAllMocks();
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      const cancelledPo = { id: 4, itemId: 400, quantity: 10, status: PurchaseOrderStatus.CANCELLED };
      mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
        if (entity === PurchaseOrder) return Promise.resolve({ ...cancelledPo });
        return Promise.resolve(null);
      });

      await expect(service.updateStatus(4, { status: PurchaseOrderStatus.RECEIVED })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockQueryRunnerManager.save).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('SQLite 드라이버(dataSource.options.type === "sqlite")에서는 pessimistic_write 락 없이 조회해야 한다', async () => {
      const originalType = mockDataSource.options.type;
      (mockDataSource.options as any).type = 'sqlite';

      try {
        const po = { id: 5, itemId: 500, quantity: 20, status: PurchaseOrderStatus.PENDING };
        mockQueryRunnerManager.findOne.mockImplementation((entity: any) => {
          if (entity === PurchaseOrder) return Promise.resolve({ ...po });
          if (entity === Inventory) return Promise.resolve(null);
          return Promise.resolve(null);
        });

        const result = await service.updateStatus(5, { status: PurchaseOrderStatus.RECEIVED });

        expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);

        const inventoryFindOne = mockQueryRunnerManager.findOne.mock.calls.find(([entity]: any) => entity === Inventory);
        expect(inventoryFindOne[1]).not.toHaveProperty('lock'); // sqlite에서는 lock 옵션 자체를 넘기지 않아야 함
      } finally {
        (mockDataSource.options as any).type = originalType;
      }
    });
  });
});