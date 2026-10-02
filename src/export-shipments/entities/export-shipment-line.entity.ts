import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ExportShipment } from './export-shipment.entity';
import { PackingReceipt } from '../../purchase-orders/entities/packing-receipt.entity';

// PR-075: INVOICE/Packing List 한 줄(= 하나의 PackingReceipt를 집계한 결과). description은
// 생성 시점에 BomItem.spec + Item.englishName + BomItem.composition을 조합해 고정 저장하고
// (예: `53" FOR THE FACE WOOL 98%, POLYURETHANE 2%`), 이후 원본 BOM/Item이 바뀌어도 이
// 라인은 다시 계산하지 않는다 — 특히 FINALIZED 이후에는 명시적으로 수정도 막는다(9.2절
// 계약 스냅샷과 동일 원칙). hsCode는 문서 출력 시에만 "(HS CODE: ...)"로 붙이는 용도라
// description과 분리해서 저장한다.
// PR-157: PurchaseOrder.unitPrice(원화)가 있으면 그 값 기준, 없으면 미도 단가표에서
// 담당자가 후보 중 하나를 골라 연결한 값 기준, 둘 다 아니면 사람이 화면에서 직접 입력한
// 값 기준 — 어느 경로로 USD 단가가 채워졌는지 화면에 표시해 검산할 수 있게 한다.
export enum ExportShipmentLinePriceSource {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  MIDO_PRICE_TABLE = 'MIDO_PRICE_TABLE',
  MANUAL = 'MANUAL',
}

@Entity('export_shipment_lines')
export class ExportShipmentLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  exportShipmentId: number;

  @ManyToOne(() => ExportShipment, (shipment) => shipment.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exportShipmentId' })
  exportShipment: ExportShipment;

  @Column()
  styleNo: string;

  // PR-080: 기 작성된 INVOICE/Packing List 엑셀을 그대로 가져온(IMPORTED) 라인은 집계
  // 대상이 된 PackingReceipt가 없다(발주/BOM과 무관하게 완성된 문서를 그대로 읽어온
  // 것이라 연결할 대상 자체가 없음) — 그래서 nullable로 바꾼다. generate()로 만든
  // (GENERATED) 라인은 기존처럼 항상 값이 채워진다.
  @Column({ nullable: true })
  packingReceiptId?: number | null;

  @ManyToOne(() => PackingReceipt, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'packingReceiptId' })
  packingReceipt?: PackingReceipt | null;

  @Column()
  description: string;

  @Column({ nullable: true })
  hsCode?: string | null;

  @Column({ type: 'decimal' })
  qty: number;

  @Column()
  unit: string;

  // 5절: 단가는 이번 PR에서 자동 계산하지 않는다 — "미정"이면 공란, 사람이 화면에서
  // 직접 입력한다. amount는 unitPrice*qty로만 자동 계산되며, unitPrice가 없으면 null.
  @Column({ type: 'decimal', nullable: true })
  unitPrice?: number | null;

  @Column({ type: 'decimal', nullable: true })
  amount?: number | null;

  @Column({ type: 'decimal', nullable: true })
  netWeight?: number | null;

  @Column({ type: 'decimal', nullable: true })
  grossWeight?: number | null;

  @Column({ type: 'int', nullable: true })
  packageCount?: number | null;

  @Column({ nullable: true })
  packageType?: string | null;

  // PR-157: 같은 스타일+자재라도 색상이 다르면 별도 라인으로 분리한다(샘플 파일의
  // "안감(BE:293Y, BK:183Y)" 표기 방식 참고). 색상 구분이 없던(IMPORTED 등) 라인은 null.
  @Column({ nullable: true })
  color?: string | null;

  // 포장내역(PackingReceipt.cbm)의 생성 시점 스냅샷 — netWeight/grossWeight와 동일하게
  // FINALIZED 이후에도 값이 바뀌지 않도록 라인에 그대로 저장한다. 값이 없으면 null(0 아님).
  @Column({ type: 'decimal', nullable: true })
  cbm?: number | null;

  // unitPrice/amount(기존 필드, 통화 불명 — 수동 입력/IMPORTED 문서에서 그대로 사용)와
  // 별개로, 이번 PR의 자동계산 결과는 USD 전용 필드에 담는다. amountUsd는 unitPriceUsd*qty.
  @Column({ type: 'decimal', nullable: true })
  unitPriceUsd?: number | null;

  @Column({ type: 'decimal', nullable: true })
  amountUsd?: number | null;

  @Column({ type: 'varchar', enum: ExportShipmentLinePriceSource, nullable: true })
  priceSource?: ExportShipmentLinePriceSource | null;
}
