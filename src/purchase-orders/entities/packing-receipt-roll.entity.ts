import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PackingReceipt } from './packing-receipt.entity';

// PR-074: 원단(FABRIC) 포장내역의 롤 단위 상세. 실물 포장명세서(예: BEANPOLE_TTL 양식)의
// R/N(롤 번호)·WIDTH(CM/INCH)·GROSS/NET WEIGHT·THICKNESS 컬럼에 대응한다.
@Entity('packing_receipt_rolls')
export class PackingReceiptRoll {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  packingReceiptId: number;

  @ManyToOne(() => PackingReceipt, (receipt) => receipt.rolls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'packingReceiptId' })
  packingReceipt: PackingReceipt;

  @Column()
  rollNo: string;

  @Column({ nullable: true })
  color?: string | null;

  @Column({ type: 'decimal', nullable: true })
  widthCm?: number | null;

  @Column({ type: 'decimal', nullable: true })
  widthInch?: number | null;

  @Column({ type: 'decimal', nullable: true })
  grossWeight?: number | null;

  @Column({ type: 'decimal', nullable: true })
  netWeight?: number | null;

  @Column({ type: 'decimal', nullable: true })
  thickness?: number | null;
}
