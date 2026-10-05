import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Shipment } from '../../shipments/entities/shipment.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';

// PR-180: 실발주(FIRM, 태일이 공급업체에 직접 발주 — FOB/완사입) / 가발주(PROVISIONAL, 본사가 실제 발주하고
// 태일은 발주 여부를 확인하며 출고·입고·선적만 챙김 — CMT). 값은 스타일 계약방식에서 제안하고 사람이 확정한다.
export enum PurchaseOrderType {
  FIRM = 'FIRM',
  PROVISIONAL = 'PROVISIONAL',
}

export enum PurchaseOrderStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Entity()
export class PurchaseOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  itemId: number;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column({ type: 'int' })
  quantity: number;

  // PR-180: 기존 행은 백필 규칙으로 채우고, 근거가 없거나 애매하면 null로 남겨 화면에서 "미지정"으로 보인다.
  @Column({ type: 'varchar', enum: PurchaseOrderType, nullable: true })
  orderType: PurchaseOrderType | null;

  // 기존(마이그레이션 이전) 행에는 값이 없을 수 있어 컬럼 자체는 nullable로 두되,
  // 신규 생성은 CreatePurchaseOrderDto에서 필수값으로 강제한다.
  @Column({ type: 'decimal', nullable: true })
  unitPrice?: number;

  @Column({
    type: 'varchar',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.PENDING,
  })
  status: PurchaseOrderStatus;

  @Column({ nullable: true })
  supplierId?: number;

  @ManyToOne(() => Supplier, (supplier) => supplier.purchaseOrders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier;

  @Column({ nullable: true })
  shipmentId?: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => Shipment, (shipment) => shipment.purchaseOrders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment;

  // PR-176: 색상/사이즈별 상세 줄(선택). 있으면 quantity는 라인 합계와 같다.
  @OneToMany(() => PurchaseOrderLine, (line) => line.purchaseOrder, { cascade: true })
  lines?: PurchaseOrderLine[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}