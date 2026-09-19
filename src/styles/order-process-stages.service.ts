import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { MasterStyle } from './entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { pickActiveBom } from '../boms/utils/active-bom.util';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { ExportShipmentLine } from '../export-shipments/entities/export-shipment-line.entity';
import { UpsertProcessStageDto } from './dto/upsert-process-stage.dto';

export interface ProcurementStatusRow {
  styleNo: string;
  buyer: string | null;
  poCreated: boolean;
  materialReadiness: { ready: number; total: number };
  exported: boolean;
  overallStatus: string;
}

// PR-089: (poCreated, ready/total, exported) 조합을 종합상태 문자열로 매핑한다.
// 발주 자체가 없으면 입고/출고 여부와 무관하게 무조건 미발주 — 입고완료는
// "BOM 자재 전부에 PO가 있고 전부 RECEIVED"일 때만 성립한다(getMaterialReadiness와
// 동일 정의). exported는 ExportShipmentLine 존재 여부로만 판단한다(PR-086 로직으로
// styleNo가 역산되어 저장되므로 이 값이 곧 "실제 수출서류에 실린 적이 있다"는 뜻).
export function computeOverallStatus(
  poCreated: boolean,
  ready: number,
  total: number,
  exported: boolean,
): string {
  if (!poCreated) return '미발주';
  if (total === 0 || ready < total) return '입고대기';
  if (!exported) return '출고대기';
  return '완료';
}

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
    @InjectRepository(ExportShipmentLine)
    private readonly exportShipmentLineRepository: Repository<ExportShipmentLine>,
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
    // 같은 style에 Bom이 여러 개면 pickActiveBom 규칙(활성 BOM 중 최신)으로 하나만 쓴다(PR-123).
    const styleBoms = await this.bomRepository.find({
      where: { style: { styleNo } },
      relations: ['items', 'items.material'],
    });
    const bom = pickActiveBom(styleBoms);
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

  // PR-089: 발주·입고·출고 현황 보고서용 배치 조회. getMaterialReadiness()를 스타일별로
  // 반복 호출하면 스타일 수 × 자재 수만큼 쿼리가 느는 N+1이 되므로, Bom/PurchaseOrder/
  // ExportShipmentLine을 각각 한 번에 전부 읽어 메모리에서 styleNo·itemId로 묶은 뒤
  // 조합한다(order-progress-summary.service.ts의 getSummary()와 동일한 패턴).
  async getProcurementStatusReport(): Promise<ProcurementStatusRow[]> {
    const [styles, boms, purchaseOrders, exportLines] = await Promise.all([
      this.masterStyleRepository.find({ relations: ['overview'] }),
      this.bomRepository.find({ relations: ['items', 'items.material', 'style'] }),
      this.purchaseOrderRepository.find(),
      this.exportShipmentLineRepository.find(),
    ]);

    // 같은 style에 Bom이 여러 개면 getMaterialReadiness와 동일하게 pickActiveBom 규칙(활성 BOM 중 최신)으로
    // 하나만 쓴다. 이미 한 번에 전부 읽어 둔 목록을 스타일별로 묶어 메모리에서 고르므로 추가 쿼리는 없다.
    const bomsByStyle = new Map<string, Bom[]>();
    for (const bom of boms) {
      const styleNo = bom.style?.styleNo;
      if (!styleNo) continue;
      bomsByStyle.set(styleNo, [...(bomsByStyle.get(styleNo) ?? []), bom]);
    }
    const latestBomByStyle = new Map<string, Bom>();
    for (const [styleNo, styleBoms] of bomsByStyle) {
      const picked = pickActiveBom(styleBoms);
      if (picked) latestBomByStyle.set(styleNo, picked);
    }

    const posByItemId = new Map<number, PurchaseOrder[]>();
    for (const po of purchaseOrders) {
      const list = posByItemId.get(po.itemId) ?? [];
      list.push(po);
      posByItemId.set(po.itemId, list);
    }

    const exportedStyleNos = new Set(exportLines.map((line) => line.styleNo));

    return styles.map((style) => {
      const bom = latestBomByStyle.get(style.styleNo);
      const materialIds = bom?.items ? [...new Set(bom.items.map((item) => item.material.id))] : [];

      let poCreated = false;
      let readyMaterials = 0;
      for (const materialId of materialIds) {
        const posForMaterial = posByItemId.get(materialId) ?? [];
        if (posForMaterial.length > 0) {
          poCreated = true;
          if (posForMaterial.every((po) => po.status === PurchaseOrderStatus.RECEIVED)) {
            readyMaterials++;
          }
        }
      }

      const exported = exportedStyleNos.has(style.styleNo);
      const materialReadiness = { ready: readyMaterials, total: materialIds.length };

      return {
        styleNo: style.styleNo,
        buyer: style.overview?.buyer ?? null,
        poCreated,
        materialReadiness,
        exported,
        overallStatus: computeOverallStatus(poCreated, readyMaterials, materialIds.length, exported),
      };
    });
  }
}
