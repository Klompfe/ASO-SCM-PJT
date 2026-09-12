import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { Contract, ContractStatus } from './entities/contract.entity';
import { OrderProcessStage, ProcessStageName } from './entities/order-process-stage.entity';
import { OrderShipment } from './entities/order-shipment.entity';
import { FULFILLMENT_WEIGHTS } from './order-progress-summary.constants';

const STAGE_ORDER: ProcessStageName[] = [
  ProcessStageName.CUTTING,
  ProcessStageName.SEWING,
  ProcessStageName.PACKING,
];

export interface StageProgress {
  completedQty: number;
  targetQty: number | null;
  rate: number; // 0~100
}

export interface OrderProgressSummaryRow {
  styleNo: string;
  factory: string | null;
  buyer: string | null;
  targetRdd: string | null;
  contractStatus: ContractStatus | 'NONE';
  stages: Record<ProcessStageName, StageProgress>;
  currentStageLabel: string;
  shipRate: number; // 0~100
  fulfillmentRate: number; // 0~100
  deliveryStatus: string;
}

@Injectable()
export class OrderProgressSummaryService {
  constructor(
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(OrderProcessStage)
    private readonly stageRepository: Repository<OrderProcessStage>,
    @InjectRepository(OrderShipment)
    private readonly shipmentRepository: Repository<OrderShipment>,
  ) {}

  // 목록 화면 하나 그리는 데 스타일당 N번씩 조회하면 스타일 수만큼 쿼리가 느는
  // N+1이 되므로, 4개 테이블을 각각 한 번에 전부 읽어 메모리에서 styleNo로
  // 묶은 뒤 조합한다.
  async getSummary(): Promise<OrderProgressSummaryRow[]> {
    const [styles, contracts, stages, shipments] = await Promise.all([
      this.masterStyleRepository.find({ relations: ['overview'] }),
      this.contractRepository.find(),
      this.stageRepository.find(),
      this.shipmentRepository.find(),
    ]);

    const contractsByStyle = groupBy(contracts, (c) => c.styleNo);
    const stagesByStyle = groupBy(stages, (s) => s.styleNo);
    const shipmentsByStyle = groupBy(shipments, (s) => s.styleNo);

    return styles.map((style) => this.buildRow(style, contractsByStyle, stagesByStyle, shipmentsByStyle));
  }

  private buildRow(
    style: MasterStyle,
    contractsByStyle: Map<string, Contract[]>,
    stagesByStyle: Map<string, OrderProcessStage[]>,
    shipmentsByStyle: Map<string, OrderShipment[]>,
  ): OrderProgressSummaryRow {
    const overview = style.overview;
    const totalQty = overview?.totalQty ? Number(overview.totalQty) : 0;
    const targetRdd = overview?.targetRdd ? String(overview.targetRdd) : null;

    // 계약 승인과 생산 진행은 별개로 추적한다(PR-067 지시사항) — 미승인 계약이
    // 있어도 fulfillmentRate 계산에서 제외하지 않고, contractStatus로만 표시.
    const contractStatus = this.resolveContractStatus(contractsByStyle.get(style.styleNo) ?? []);

    const styleStages = stagesByStyle.get(style.styleNo) ?? [];
    const stageMap = {} as Record<ProcessStageName, StageProgress>;
    for (const stageName of STAGE_ORDER) {
      const record = styleStages.find((s) => s.stage === stageName);
      const completedQty = record ? Number(record.completedQty) : 0;
      const stageTargetQty = record?.targetQty != null ? Number(record.targetQty) : null;
      const rate = stageTargetQty && stageTargetQty > 0 ? Math.min(100, (completedQty / stageTargetQty) * 100) : 0;
      stageMap[stageName] = { completedQty, targetQty: stageTargetQty, rate };
    }

    const currentStageLabel = this.resolveCurrentStageLabel(stageMap);

    const shippedQty = (shipmentsByStyle.get(style.styleNo) ?? [])
      .filter((s) => s.actualShipDate)
      .reduce((sum, s) => sum + Number(s.quantity), 0);
    const shipRate = totalQty > 0 ? Math.min(100, (shippedQty / totalQty) * 100) : 0;

    const processRate = STAGE_ORDER.reduce((sum, name) => sum + stageMap[name].rate, 0) / STAGE_ORDER.length;
    const fulfillmentRate =
      processRate * FULFILLMENT_WEIGHTS.process + shipRate * FULFILLMENT_WEIGHTS.shipping;

    const deliveryStatus = this.resolveDeliveryStatus(totalQty, shippedQty, targetRdd);

    return {
      styleNo: style.styleNo,
      factory: overview?.factory ?? null,
      buyer: overview?.buyer ?? null,
      targetRdd,
      contractStatus,
      stages: stageMap,
      currentStageLabel,
      shipRate,
      fulfillmentRate,
      deliveryStatus,
    };
  }

  // "가장 최근 APPROVED 계약이 있으면 그 상태, 없으면 PENDING_APPROVAL이나
  // 계약 자체 없음 표시"(PR-067 지시사항) — APPROVED가 최우선이고, 없으면
  // PENDING_APPROVAL 존재 여부로 판정한다. REJECTED/SUPERSEDED만 있고
  // 활성(APPROVED/PENDING_APPROVAL) 계약이 전혀 없으면 NONE으로 본다.
  private resolveContractStatus(contracts: Contract[]): ContractStatus | 'NONE' {
    if (contracts.some((c) => c.status === ContractStatus.APPROVED)) return ContractStatus.APPROVED;
    if (contracts.some((c) => c.status === ContractStatus.PENDING_APPROVAL)) return ContractStatus.PENDING_APPROVAL;
    return 'NONE';
  }

  // 지시사항의 문구("0%초과 100%미만인 가장 앞선 단계")를 그대로 적용하면 예를 들어
  // 재단 100%/봉제 0%/포장 0%처럼 "정확히 100% 아니면 정확히 0%"뿐인 경우
  // 어느 단계도 조건에 안 걸려 판정이 안 된다. 그래서 "아직 100% 미만인 가장
  // 앞선 단계"로 넓혀 해석한다 — 재단이 끝났으면 다음 단계인 봉제가 현재
  // 단계라고 보는 게 실무적으로 더 맞다.
  private resolveCurrentStageLabel(stageMap: Record<ProcessStageName, StageProgress>): string {
    const allComplete = STAGE_ORDER.every((name) => stageMap[name].rate >= 100);
    if (allComplete) return '출고대기';

    const allNotStarted = STAGE_ORDER.every((name) => stageMap[name].rate <= 0);
    if (allNotStarted) return '미착수';

    const current = STAGE_ORDER.find((name) => stageMap[name].rate < 100);
    return current ? STAGE_LABELS[current] : '출고대기';
  }

  private resolveDeliveryStatus(totalQty: number, shippedQty: number, targetRdd: string | null): string {
    if (totalQty <= 0) return '-';
    const remainingQty = totalQty - shippedQty;
    if (remainingQty <= 0) return '정상납품';
    const isPastDue = targetRdd ? new Date(targetRdd).getTime() < Date.now() : false;
    return isPastDue ? '납기지연' : '진행중';
  }
}

const STAGE_LABELS: Record<ProcessStageName, string> = {
  [ProcessStageName.CUTTING]: '재단',
  [ProcessStageName.SEWING]: '봉제',
  [ProcessStageName.PACKING]: '포장',
};

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
