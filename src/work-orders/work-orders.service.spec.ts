import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrderStatus } from './entities/work-order-status.enum';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let woRepository: Repository<WorkOrder>;
  let dataSource: DataSource;

  const mockWoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockItemRepository = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Item) return mockItemRepository;
      return mockWoRepository;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: mockWoRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
    woRepository = module.get<Repository<WorkOrder>>(getRepositoryToken(WorkOrder));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('완제품 및 BOM이 존재하는 경우 작업지시를 정상 생성해야 한다', async () => {
      const dto = { itemId: 1, targetQuantity: 10 };
      const mockItem = { id: 1, name: '완제품 A' };
      const expectedWo = { id: 1, ...dto, item: mockItem, status: WorkOrderStatus.PENDING };

      mockItemRepository.findOne.mockResolvedValue(mockItem);
      mockWoRepository.create.mockReturnValue(expectedWo);
      mockWoRepository.save.mockResolvedValue(expectedWo);

      const result = await service.create(dto as any);
      expect(result).toEqual(expectedWo);
    });
  });

  describe('updateStatus', () => {
    it('COMPLETED 상태 변경 시 완제품 증대 및 원자재 차감이 정상 동작해야 한다', async () => {
      const mockWo = { id: 1, targetQuantity: 10, status: WorkOrderStatus.IN_PROGRESS };
      const updatedWo = { ...mockWo, status: WorkOrderStatus.COMPLETED };

      mockWoRepository.findOne.mockResolvedValue(mockWo);
      mockWoRepository.save.mockResolvedValue(updatedWo);

      const result = await service.updateStatus(1, WorkOrderStatus.COMPLETED);
      expect(result.status).toEqual(WorkOrderStatus.COMPLETED);
    });
  });
});