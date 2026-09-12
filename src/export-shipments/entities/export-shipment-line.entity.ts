import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ExportShipment } from './export-shipment.entity';
import { PackingReceipt } from '../../purchase-orders/entities/packing-receipt.entity';

// PR-075: INVOICE/Packing List 한 줄(= 하나의 PackingReceipt를 집계한 결과). description은
// 생성 시점에 BomItem.spec + Item.englishName + BomItem.composition을 조합해 고정 저장하고
// (예: `53" FOR THE FACE WOOL 98%, POLYURETHANE 2%`), 이후 원본 BOM/Item이 바뀌어도 이
// 라인은 다시 계산하지 않는다 — 특히 FINALIZED 이후에는 명시적으로 수정도 막는다(9.2절
// 계약 스냅샷과 동일 원칙). hsCode는 문서 출력 시에만 "(HS CODE: ...)"로 붙이는 용도라
// description과 분리해서 저장한다.
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

  @Column()
  packingReceiptId: number;

  @ManyToOne(() => PackingReceipt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'packingReceiptId' })
  packingReceipt: PackingReceipt;

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
}
