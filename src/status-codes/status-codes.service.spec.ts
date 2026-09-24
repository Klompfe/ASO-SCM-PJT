import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StatusCodesService } from './status-codes.service';
import { StatusCode } from './entities/status-code.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';

describe('StatusCodesService (PR-140)', () => {
  let service: StatusCodesService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => ({ id: data.id ?? 1, ...data })),
    remove: jest.fn(),
  };

  const mockWorkOrderRepository = { count: jest.fn() };
  const mockDataSource = {
    getRepository: jest.fn().mockImplementation((entity: any) => (entity === WorkOrder ? mockWorkOrderRepository : mockRepository)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusCodesService,
        { provide: getRepositoryToken(StatusCode), useValue: mockRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<StatusCodesService>(StatusCodesService);
  });

  describe('findAll', () => {
    it('기본은 활성(isActive:true)만, sortOrder/id 순으로 조회한다', async () => {
      mockRepository.find.mockResolvedValue([]);
      await service.findAll('WORK_ORDER');
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { domain: 'WORK_ORDER', isActive: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });

    it('includeInactive=true면 활성 여부와 무관하게 조회한다', async () => {
      mockRepository.find.mockResolvedValue([]);
      await service.findAll('WORK_ORDER', true);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { domain: 'WORK_ORDER' },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('같은 domain+code가 이미 있으면 BadRequestException', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, domain: 'WORK_ORDER', code: 'PENDING' });
      await expect(
        service.create({ domain: 'WORK_ORDER', code: 'PENDING', label: '대기' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('신규 등록: sortOrder/isActive 기본값(0/true)을 채워 저장한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const saved = await service.create({ domain: 'WORK_ORDER', code: 'ON_HOLD', label: '보류' });
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'WORK_ORDER', code: 'ON_HOLD', label: '보류', sortOrder: 0, isActive: true }),
      );
      expect(saved.code).toBe('ON_HOLD');
    });
  });

  describe('update', () => {
    it('존재하지 않는 id면 NotFoundException', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.update(999, { label: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('label/sortOrder/isActive만 바꾼다(domain/code는 DTO에 없어 건드릴 수 없음)', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, domain: 'WORK_ORDER', code: 'PENDING', label: '대기', sortOrder: 1, isActive: true });
      const result = await service.update(1, { label: '대기중', isActive: false });
      expect(result.label).toBe('대기중');
      expect(result.isActive).toBe(false);
      expect(result.code).toBe('PENDING'); // 그대로
    });
  });

  describe('remove — 사용 중인 상태코드는 삭제를 막는다', () => {
    it('WORK_ORDER 도메인이고 사용 중(count>0)이면 ConflictException, 삭제하지 않는다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 1, domain: 'WORK_ORDER', code: 'PENDING' });
      mockWorkOrderRepository.count.mockResolvedValue(3);
      await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
      expect(mockWorkOrderRepository.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
      expect(mockRepository.remove).not.toHaveBeenCalled();
    });

    it('WORK_ORDER 도메인이고 사용 중이 아니면(count=0) 삭제된다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 2, domain: 'WORK_ORDER', code: 'ON_HOLD' });
      mockWorkOrderRepository.count.mockResolvedValue(0);
      await service.remove(2);
      expect(mockRepository.remove).toHaveBeenCalled();
    });

    it('아직 사용량 checker가 없는 도메인은 사용 여부를 확인하지 않고 삭제를 허용한다', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 3, domain: 'CONTRACT', code: 'DRAFT' });
      await service.remove(3);
      expect(mockWorkOrderRepository.count).not.toHaveBeenCalled();
      expect(mockRepository.remove).toHaveBeenCalled();
    });

    it('존재하지 않는 id면 NotFoundException', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.remove(404)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
