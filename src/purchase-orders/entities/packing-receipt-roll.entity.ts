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

  // PR-157: 실제 원단 롤 길이(야드) — 공급업체 패킹리스트에 이미 적혀 있는 값을 그대로
  // 옮겨 적는 용도. 과거 등록분은 이 값이 없을 수 있어 nullable로 두고, generate()가
  // 합산할 때 누락된 롤이 있으면 경고로만 알린다(추측으로 채우지 않는다).
  @Column({ type: 'decimal', nullable: true })
  lengthYd?: number | null;
}
