import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ImportShipment } from '../../import-shipments/entities/import-shipment.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

// PR-107: 완제품입고증 — 수입통관 완료(CLEARED)된 건을 실제로 받아 재고/납품
// 처리했음을 기록하는 문서. 하나의 ImportShipment에 대해 여러 번(색상/사이즈
// 일부씩 나눠서) 작성할 수 있다 — 한 번에 전체를 다 작성해야 하는 제약 없음.
@Entity('goods_receipts')
export class GoodsReceipt {
  @PrimaryGeneratedColumn()
  id: number;

  // "GR-{YY}{4자리 일련번호}" 형식 자동채번(Supplier/Buyer, PR-085/088과 동일 패턴).
  @Column({ unique: true })
  receiptNo: string;

  @Column({ type: 'date' })
  issuedDate: Date;

  @Column()
  importShipmentId: number;

  @ManyToOne(() => ImportShipment)
  @JoinColumn({ name: 'importShipmentId' })
  importShipment: ImportShipment;

  @Column({ type: 'text', nullable: true })
  remark?: string | null;

  @OneToMany(() => GoodsReceiptLine, (line) => line.goodsReceipt, { cascade: true })
  lines?: GoodsReceiptLine[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
