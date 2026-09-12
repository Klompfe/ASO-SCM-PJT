import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { PackingReceiptRoll } from './packing-receipt-roll.entity';
import { PackingReceiptCarton } from './packing-receipt-carton.entity';

export enum PackingMaterialCategory {
  FABRIC = 'FABRIC',
  TRIM = 'TRIM',
}

// PR-074: 공급사가 보내온 포장내역(원단=롤 단위, 부자재=카톤 단위) 등록. PurchaseOrder의
// 하위 흐름이라 독립 모듈로 두지 않는다. styleNo/공급사명은 PurchaseOrder(→Item/Supplier)
// 관계로 파생되는 값이라 여기 중복 저장하지 않는다.
@Entity('packing_receipts')
export class PackingReceipt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  purchaseOrderId: number;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @Column({ type: 'varchar', enum: PackingMaterialCategory })
  materialCategory: PackingMaterialCategory;

  @Column({ type: 'date', nullable: true })
  receivedDate?: Date | null;

  @Column({ nullable: true })
  remark?: string | null;

  @OneToMany(() => PackingReceiptRoll, (roll) => roll.packingReceipt, { cascade: true })
  rolls?: PackingReceiptRoll[];

  @OneToMany(() => PackingReceiptCarton, (carton) => carton.packingReceipt, { cascade: true })
  cartons?: PackingReceiptCarton[];

  @CreateDateColumn()
  createdAt: Date;
}
