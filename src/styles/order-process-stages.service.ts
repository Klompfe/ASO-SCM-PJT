import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { MasterStyle } from './entities/master-style.entity';
import { Bom } from '../boms/entities/bom.entity';
import { pickActiveBom } from '../boms/utils/active-bom.util';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { PackingReceipt } from '../purchase-orders/entities/packing-receipt.entity';
import { ExportShipmentLine } from '../export-shipments/entities/export-shipment-line.entity';
import { UpsertProcessStageDto } from './dto/upsert-process-stage.dto';
import { buildItemStyleUsage, attributePo, poBelongsToStyle } from '../purchase-orders/utils/po-style-attribution.util';

export interface ProcurementStatusRow {
  styleNo: string;
  buyer: string | null;
  poCreated: boolean;
  materialReadiness: { ready: number; total: number };
  exported: boolean;
  // PR-179: 입고 완료인데 포장내역이 하나도 없는 발주가 있는지, 있으면 그 발주(포장내역 등록 대상).
  packed: boolean;
  packingPendingPurchaseOrderId: number | null;
  overallStatus: string;
  // PR-196: 이 스타일의 BOM 자재 중 "모호한 미연결 발주"(같은 자재를 2개 이상 스타일이 써서
  // 누구 몫인지 알 수 없는 발주)가 걸려 있는 발주 건수(중복 없이) — 화면이 주황 배지로 안내.
  unlinkedPoCount: number;
  // PR-196: 이 스타일 몫으로 "자동 귀속"된(미연결 발주인데 이 자재를 쓰는 스타일이 이것
  // 하나뿐이라 모호함 없이 귀속된) 발주 건수.
  autoAttributedPoCount: number;
  targetRdd: string | null;
  brand: string | null;
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
  packed: boolean,
): string {
  if (!poCreated) return '미발주';
  if (total === 0 || ready < total) return '입고대기';
  if (!packed) return '포장내역대기';
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
    @InjectRepository(PackingReceipt)
    private readonly packingReceiptRepository: Repository<PackingReceipt>,
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
  // 자재(품목) 단위로 "그 자재의, 이 스타일 몫 PO가 하나라도 있고 전부 RECEIVED면 준비완료"로
  // 판단한다. PR-196: 품목(itemId)만 보고 발주를 찾으면 다른 스타일이 쓴 같은 자재까지
  // "입고완료"로 섞여 버리는 버그가 있었다 — po-style-attribution.util로 스타일 귀속을
  // 가린 뒤에만 센다(다른 스타일 연결 발주/모호한 미연결 발주는 제외).
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
    // 귀속 판단(AUTO/AMBIGUOUS)에는 전체 스타일의 활성 BOM 목록이 필요하다 — 쿼리 1번으로
    // 한 번에 읽는다(자재 개수만큼 반복 조회하지 않음 — N+1 금지).
    const allBoms = await this.bomRepository.find({ relations: ['items', 'items.material', 'style'] });
    const itemStyleUsage = buildItemStyleUsage(allBoms);

    let readyMaterials = 0;
    for (const materialId of materialIds) {
      // 기존처럼 자재 단위로 1번씩 조회한다(쿼리 수는 그대로 — 그 안에서 취소 제외 + 스타일
      // 귀속 필터만 추가).
      const purchaseOrders = (await this.purchaseOrderRepository.find({ where: { itemId: materialId } }))
        .filter((po) => po.status !== PurchaseOrderStatus.CANCELLED)
        .filter((po) => poBelongsToStyle(po, styleNo, itemStyleUsage));
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
    const receipts = await this.packingReceiptRepository.find({ select: { id: true, purchaseOrderId: true } });
    const purchaseOrderIdsWithReceipt = new Set(receipts.map((r) => r.purchaseOrderId));

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

    // PR-196: 품목(itemId)만으로 묶으면 다른 스타일이 쓴 같은 자재의 발주까지 섞여 버린다
    // (이번 버그의 원인) — po-style-attribution.util로 스타일 귀속을 가린다. boms는 이미
    // 한 번에 전부 읽어 뒀으므로(위 Promise.all) 추가 쿼리 없이 itemStyleUsage를 만들 수 있다.
    const itemStyleUsage = buildItemStyleUsage(boms);
    const livePurchaseOrders = purchaseOrders.filter((po) => po.status !== PurchaseOrderStatus.CANCELLED);
    const posByItemId = new Map<number, PurchaseOrder[]>();
    for (const po of livePurchaseOrders) {
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
      let packingPendingPurchaseOrderId: number | null = null;
      const ambiguousPoIds = new Set<number>();
      const autoAttributedPoIds = new Set<number>();
      for (const materialId of materialIds) {
        const posForMaterial = posByItemId.get(materialId) ?? [];
        const ownPos = posForMaterial.filter((po) => poBelongsToStyle(po, style.styleNo, itemStyleUsage));
        if (ownPos.length > 0) {
          poCreated = true;
          if (ownPos.every((po) => po.status === PurchaseOrderStatus.RECEIVED)) {
            readyMaterials++;
          }
        }
        for (const po of posForMaterial) {
          const attribution = attributePo(po, itemStyleUsage);
          if (attribution.kind === 'AMBIGUOUS' && attribution.candidates.includes(style.styleNo)) {
            ambiguousPoIds.add(po.id);
          }
          if (attribution.kind === 'AUTO' && attribution.styleNo === style.styleNo) {
            autoAttributedPoIds.add(po.id);
          }
        }
        // 입고된 발주인데 포장내역이 없는 것 — 이 발주가 "포장내역대기"의 대상이다(이 스타일 몫만).
        for (const po of ownPos) {
          if (po.status === PurchaseOrderStatus.RECEIVED && !purchaseOrderIdsWithReceipt.has(po.id) && packingPendingPurchaseOrderId === null) {
            packingPendingPurchaseOrderId = po.id;
          }
        }
      }
      const packed = materialIds.length > 0 && readyMaterials === materialIds.length && packingPendingPurchaseOrderId === null;

      const exported = exportedStyleNos.has(style.styleNo);
      const materialReadiness = { ready: readyMaterials, total: materialIds.length };

      return {
        styleNo: style.styleNo,
        buyer: style.overview?.buyer ?? null,
        poCreated,
        materialReadiness,
        exported,
        packed,
        packingPendingPurchaseOrderId,
        overallStatus: computeOverallStatus(poCreated, readyMaterials, materialIds.length, exported, packed),
        unlinkedPoCount: ambiguousPoIds.size,
        autoAttributedPoCount: autoAttributedPoIds.size,
        targetRdd: style.overview?.targetRdd ? new Date(style.overview.targetRdd).toISOString().slice(0, 10) : null,
        brand: style.overview?.brand ?? null,
      };
    });
  }
}
