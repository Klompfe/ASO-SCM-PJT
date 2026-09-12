import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PackingReceipt } from './packing-receipt.entity';

// PR-074: 부자재(TRIM) 포장내역의 카톤 단위 상세. 실물 포장명세서(예: MATERIAL PACKING
// LIST 양식)의 CT/No.(카톤 번호)·Color·Size·LOT·Q'ty·Item·Kg 컬럼에 대응한다. 카톤 하나에
// 여러 품목/컬러 라인이 함께 담기는 경우가 많아(예: 라벨+가격택이 같은 박스) 카톤 번호가
// 여러 행에 걸쳐 반복될 수 있다 — 1행 = 1개의 카톤 내 품목 라인.
@Entity('packing_receipt_cartons')
export class PackingReceiptCarton {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  packingReceiptId: number;

  @ManyToOne(() => PackingReceipt, (receipt) => receipt.cartons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'packingReceiptId' })
  packingReceipt: PackingReceipt;

  @Column()
  cartonNo: string;

  @Column({ nullable: true })
  color?: string | null;

  @Column({ nullable: true })
  size?: string | null;

  @Column({ nullable: true })
  lotNo?: string | null;

  @Column({ type: 'int', default: 0 })
  qty: number;

  @Column({ nullable: true })
  itemName?: string | null;

  @Column({ type: 'decimal', nullable: true })
  weightKg?: number | null;
}
