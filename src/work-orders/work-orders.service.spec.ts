import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, Repository, QueryRunner } from 'typeorm';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { Item, ItemType } from '../items/entities/item.entity';
import { Bom } from '../items/entities/bom.entity';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let workOrderRepository: jest.Mocked<Repository<WorkOrder>>;
  let itemRepository: jest.Mocked<Repository<Item>>;
  let bomRepository: jest.Mocked<Repository<Bom>>;
  let queryRunner: jest.Mocked<QueryRunner>;

  const mockItem = {
    id: 1,
    name: '양말 A',
    code: 'FG-001',
    type: 'FINISHED' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Item;

  const mockWorkOrder = {
    id: 'wo-uuid-1',
    item: mockItem,
    quantity: 10,
    status: WorkOrderStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WorkOrder;

  beforeEach(async () => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Item),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Bom),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(queryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
    workOrderRepository = module.get(getRepositoryToken(WorkOrder));
    itemRepository = module.get(getRepositoryToken(Item));
    bomRepository = module.get(getRepositoryToken(Bom));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('완제품 및 BOM이 존재하는 경우 작업지시를 정상 생성해야 한다', async () => {
      itemRepository.findOne.mockResolvedValue(mockItem);
      bomRepository.find.mockResolvedValue([{ id: 1 } as any]);
      workOrderRepository.create.mockReturnValue(mockWorkOrder);
      workOrderRepository.save.mockResolvedValue(mockWorkOrder);

      const result = await service.create({ itemId: 1, quantity: 10 });

      expect(result).toEqual(mockWorkOrder);
    });
  });

  describe('updateStatus', () => {
    it('COMPLETED 상태 변경 시 완제품 증대 및 원자재 차감이 정상 동작해야 한다', async () => {
      const mockBom = {
        id: 1,
        quantity: 2,
        childItem: { id: 2, name: '원사 B' },
      };
      const mockRawInventory = { id: 'inv-1', quantity: 100 };
      const mockFinishedInventory = { id: 'inv-2', quantity: 10 };

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockWorkOrder) // WorkOrder 조회
        .mockResolvedValueOnce(mockRawInventory) // 원자재 재고 조회
        .mockResolvedValueOnce(mockFinishedInventory); // 완제품 재고 조회

      (queryRunner.manager.find as jest.Mock).mockResolvedValue([mockBom]);
      (queryRunner.manager.save as jest.Mock).mockImplementation(async (e) => e);

      const result = await service.updateStatus('wo-uuid-1', {
        status: WorkOrderStatus.COMPLETED,
      });

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(mockRawInventory.quantity).toBe(80); // 100 - (2 * 10) = 80
      expect(mockFinishedInventory.quantity).toBe(20); // 10 + 10 = 20
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(result.status).toBe(WorkOrderStatus.COMPLETED);
    });
  });
});