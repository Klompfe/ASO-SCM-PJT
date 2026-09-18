import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { GoodsReceipt } from './goods-receipt.entity';
import { ImportShipmentPackingDetail } from '../../import-shipments/entities/import-shipment-packing-detail.entity';

// PR-107: 상세내역(ImportShipmentPackingDetail) 한 줄이 입고증 한 줄로 복사되는
// 시점의 스냅샷 — 이후 상세내역이 수정/삭제되어도 이미 발급된 입고증 라인은
// 바뀌지 않아야 하므로 styleNo/color/size/originalQty를 그대로 복사해 둔다.
@Entity('goods_receipt_lines')
export class GoodsReceiptLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  goodsReceiptId: number;

  @ManyToOne(() => GoodsReceipt, (receipt) => receipt.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goodsReceiptId' })
  goodsReceipt: GoodsReceipt;

  // 어느 상세내역 행에서 복사되었는지 — "이미 입고증 작성됨" 표시/중복 작성 경고에 쓴다.
  @Column()
  packingDetailId: number;

  // onDelete를 지정하지 않아 기본 제약(RESTRICT)을 쓴다 — 이미 입고증 라인이
  // 참조 중인 상세내역 행은 DB 차원에서도 삭제될 수 없다(서비스에서도 사전에
  // 막고 400을 준다, deletePackingDetail() 참고).
  @ManyToOne(() => ImportShipmentPackingDetail)
  @JoinColumn({ name: 'packingDetailId' })
  packingDetail?: ImportShipmentPackingDetail;

  @Column()
  styleNo: string;

  @Column()
  color: string;

  @Column()
  size: string;

  @Column({ type: 'decimal' })
  originalQty: number;

  @Column({ type: 'decimal' })
  adjustedQty: number;

  // 조정된 경우(adjustedQty !== originalQty)에만 필수 — 서비스 레이어에서 검증한다
  // (originalQty는 DTO로 넘어오지 않고 서버가 packingDetail에서 조회해 판단하므로
  // class-validator의 선언적 @ValidateIf로는 표현할 수 없다).
  @Column({ type: 'text', nullable: true })
  adjustmentReason?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
