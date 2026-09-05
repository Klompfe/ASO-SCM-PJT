import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Shipment } from '../../shipments/entities/shipment.entity';

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

  @ManyToOne(() => Shipment, (shipment) => shipment.purchaseOrders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}