import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportShipmentDefaultsService } from './export-shipment-defaults.service';
import { ExportShipmentDefaults } from './entities/export-shipment-defaults.entity';

// PR-193: Carrier(선박/운송사/항차)는 선적 건마다 바뀌는 값이라 기본값에서 뺐다 —
// update()가 dto에 carrier가 와도 저장하지 않는지(신규 생성/기존 행 갱신 둘 다)를
// 검증한다. 컬럼 자체는 추가 전용 원칙에 따라 지우지 않으므로, 이미 저장돼 있던
// 과거 carrier 값은 그대로 보존되어야 한다(건드리지 않음).
describe('ExportShipmentDefaultsService.update — carrier 무시 (PR-193)', () => {
  let service: ExportShipmentDefaultsService;
  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve(x)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository.create.mockImplementation((x: any) => x);
    mockRepository.save.mockImplementation((x: any) => Promise.resolve(x));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportShipmentDefaultsService,
        { provide: getRepositoryToken(ExportShipmentDefaults), useValue: mockRepository },
      ],
    }).compile();
    service = module.get(ExportShipmentDefaultsService);
  });

  it('행이 아직 없을 때(최초 생성) dto에 carrier가 와도 저장되는 행에 carrier가 포함되지 않는다', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.update({
      shipperInfo: 'TAE IL TRADING CO.,LTD',
      carrier: 'DONGJIN CONTINENTAL / 0217W',
    } as any);

    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ shipperInfo: 'TAE IL TRADING CO.,LTD' }),
    );
    expect(mockRepository.create.mock.calls[0][0]).not.toHaveProperty('carrier');
    expect(result).not.toHaveProperty('carrier');
  });

  it('이미 carrier="OLD"가 저장된 기존 행에 dto로 새 carrier를 보내도 기존 값이 그대로 유지된다', async () => {
    mockRepository.findOne.mockResolvedValue({
      id: 1, shipperInfo: '기존 발신인', carrier: 'OLD', updatedAt: new Date(),
    });

    const result = await service.update({
      shipperInfo: '새 발신인',
      carrier: 'NEW CARRIER / 0001W',
    } as any);

    expect(result.carrier).toBe('OLD'); // dto의 carrier로 덮어쓰이지 않는다
    expect(result.shipperInfo).toBe('새 발신인'); // 다른 필드는 정상적으로 갱신된다
  });

  it('dto에 carrier가 아예 없어도(정상적인 신버전 화면) 기존 저장을 그대로 수행한다', async () => {
    mockRepository.findOne.mockResolvedValue({
      id: 1, shipperInfo: '기존 발신인', carrier: 'OLD', updatedAt: new Date(),
    });

    const result = await service.update({ portOfLoading: 'INCHEON, KOREA' } as any);

    expect(result.portOfLoading).toBe('INCHEON, KOREA');
    expect(result.carrier).toBe('OLD');
  });
});
