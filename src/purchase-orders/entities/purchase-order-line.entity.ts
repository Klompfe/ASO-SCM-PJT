import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

// PR-176: 발주의 색상/사이즈별 상세 줄. 색상/사이즈는 자유 텍스트(ImportShipmentPackingDetail,
// PackingReceiptCarton과 동일 방식 — 별도 마스터 없음). 수량은 PurchaseOrder.quantity(int)와
// 맞추기 위해 정수다. 라인이 없는 기존 발주는 이 테이블에 행이 없고 quantity만 쓴다.
@Entity('purchase_order_lines')
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  purchaseOrderId: number;

  @ManyToOne(() => PurchaseOrder, (po) => po.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @Column({ type: 'varchar', nullable: true })
  color?: string | null;

  @Column({ type: 'varchar', nullable: true })
  size?: string | null;

  @Column({ type: 'int' })
  qty: number;
}
