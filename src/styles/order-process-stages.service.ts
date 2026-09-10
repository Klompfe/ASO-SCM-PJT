import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { MasterStyle } from './entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { UpsertProcessStageDto } from './dto/upsert-process-stage.dto';

@Injectable()
export class OrderProcessStagesService {
  constructor(
    @InjectRepository(OrderProcessStage)
    private readonly stageRepository: Repository<OrderProcessStage>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
  ) {}

  // 단계별 진행 상황은 하루에 끝나지 않고 여러 날에 걸쳐 갱신되므로(재단 900/1372개처럼
  // 부분 진행), (styleNo, stage) 단위로 있으면 갱신, 없으면 생성하는 upsert로 둔다.
  async upsert(dto: UpsertProcessStageDto): Promise<OrderProcessStage> {
    const style = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo } });
    if (!style) {
      throw new NotFoundException(`존재하지 않는 스타일입니다: ${dto.styleNo}`);
    }

    let record = await this.stageRepository.findOne({ where: { styleNo: dto.styleNo, stage: dto.stage } });
    if (!record) {
      record = this.stageRepository.create({ styleNo: dto.styleNo, stage: dto.stage });
    }

    if (dto.startDate !== undefined) record.startDate = new Date(dto.startDate);
    if (dto.finishDate !== undefined) record.finishDate = new Date(dto.finishDate);
    if (dto.targetQty !== undefined) record.targetQty = dto.targetQty;
    if (dto.completedQty !== undefined) record.completedQty = dto.completedQty;
    if (dto.lineOrTeam !== undefined) record.lineOrTeam = dto.lineOrTeam;

    return this.stageRepository.save(record);
  }

  async findByStyleNo(styleNo: string): Promise<OrderProcessStage[]> {
    return this.stageRepository.find({ where: { styleNo }, order: { id: 'ASC' } });
  }

  // 자재입고는 별도 입력 없이 BOM + 발주(PO) 데이터에서 자동 파생한다(PR-063 설계).
  // 자재(품목) 단위로 "그 자재의 PO가 하나라도 있고 전부 RECEIVED면 준비완료"로 판단한다.
  async getMaterialReadiness(styleNo: string): Promise<{ totalMaterials: number; readyMaterials: number }> {
    const bom = await this.bomRepository.findOne({
      where: { style: { styleNo } },
      order: { id: 'DESC' }, // 같은 style에 Bom이 여러 개면 최신 것만 사용 (work-orders.service.ts와 동일한 관례)
      relations: ['items', 'items.material'],
    });
    if (!bom || !bom.items || bom.items.length === 0) {
      return { totalMaterials: 0, readyMaterials: 0 };
    }

    const materialIds = [...new Set(bom.items.map((item) => item.material.id))];
    let readyMaterials = 0;
    for (const materialId of materialIds) {
      const purchaseOrders = await this.purchaseOrderRepository.find({ where: { itemId: materialId } });
      if (purchaseOrders.length > 0 && purchaseOrders.every((po) => po.status === PurchaseOrderStatus.RECEIVED)) {
        readyMaterials++;
      }
    }

    return { totalMaterials: materialIds.length, readyMaterials };
  }
}
