import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportShipmentsService } from './export-shipments.service';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PackingReceipt } from '../purchase-orders/entities/packing-receipt.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ExportShipment } from './entities/export-shipment.entity';
import { ExportShipmentLine } from './entities/export-shipment-line.entity';
import { ExportShipmentDefaultsService } from '../export-shipment-defaults/export-shipment-defaults.service';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';

// PR-102: 스타일번호/자재명(description)/선적건번호(sheetNo) 검색 필터.
describe('ExportShipmentsService.findAll — 검색 필터 (PR-102)', () => {
  let service: ExportShipmentsService;
  let shipmentRepo: Repository<ExportShipment>;

  const buildQueryBuilder = (matchedIds: number[]) => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(matchedIds.map((id) => ({ id }))),
    };
    return qb;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportShipmentsService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: {} },
        { provide: getRepositoryToken(PackingReceipt), useValue: {} },
        { provide: getRepositoryToken(BomItem), useValue: {} },
        {
          provide: getRepositoryToken(ExportShipment),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        { provide: getRepositoryToken(ExportShipmentLine), useValue: {} },
        { provide: ExportShipmentDefaultsService, useValue: {} },
        { provide: BrandPrefixRulesService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get(ExportShipmentsService);
    shipmentRepo = module.get(getRepositoryToken(ExportShipment));
  });

  it('필터를 아무것도 지정하지 않으면 find()로 전체를 조회한다(쿼리빌더 안 씀)', async () => {
    (shipmentRepo.find as jest.Mock).mockResolvedValue([]);

    await service.findAll({});

    expect(shipmentRepo.find).toHaveBeenCalledTimes(1);
    expect(shipmentRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('styleNo만 지정하면 line.styleNo LIKE 조건만 걸린다', async () => {
    const qb = buildQueryBuilder([1]);
    (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 1, lines: [] }]);

    await service.findAll({ styleNo: 'MB62' });

    expect(qb.andWhere).toHaveBeenCalledWith('line.styleNo LIKE :styleNo', { styleNo: '%MB62%' });
    expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('description'), expect.anything());
  });

  it('materialName만 지정하면 line.description LIKE 조건만 걸린다', async () => {
    const qb = buildQueryBuilder([2]);
    (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 2, lines: [] }]);

    await service.findAll({ materialName: 'WOOL' });

    expect(qb.andWhere).toHaveBeenCalledWith('line.description LIKE :materialName', { materialName: '%WOOL%' });
  });

  it('sheetNo만 지정하면 shipment.sheetNo LIKE 조건만 걸린다', async () => {
    const qb = buildQueryBuilder([3]);
    (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 3, lines: [] }]);

    await service.findAll({ sheetNo: 'TY-260704K' });

    expect(qb.andWhere).toHaveBeenCalledWith('shipment.sheetNo LIKE :sheetNo', { sheetNo: '%TY-260704K%' });
  });

  it('styleNo+materialName+sheetNo를 모두 지정하면 셋 다 andWhere로 걸린다(AND 결합, 조합 가능)', async () => {
    const qb = buildQueryBuilder([1]);
    (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    (shipmentRepo.find as jest.Mock).mockResolvedValue([{ id: 1, lines: [] }]);

    await service.findAll({ styleNo: 'MB62', materialName: 'WOOL', sheetNo: 'TY-260704K' });

    expect(qb.andWhere).toHaveBeenCalledWith('line.styleNo LIKE :styleNo', { styleNo: '%MB62%' });
    expect(qb.andWhere).toHaveBeenCalledWith('line.description LIKE :materialName', { materialName: '%WOOL%' });
    expect(qb.andWhere).toHaveBeenCalledWith('shipment.sheetNo LIKE :sheetNo', { sheetNo: '%TY-260704K%' });
  });

  it('매칭되는 id가 없으면 빈 배열을 반환하고 find()를 호출하지 않는다', async () => {
    const qb = buildQueryBuilder([]);
    (shipmentRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

    const result = await service.findAll({ styleNo: 'NO-MATCH' });

    expect(result).toEqual([]);
    expect(shipmentRepo.find).not.toHaveBeenCalled();
  });
});
