import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';

export enum ShipmentStatus {
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'shipment_number', unique: true })
  shipmentNumber: string;

  @Column({ name: 'carrier_name', nullable: true })
  carrierName?: string;

  @Column({ name: 'tracking_number', nullable: true })
  trackingNumber?: string;

  @Column({
    type: 'varchar',
    enum: ShipmentStatus,
    default: ShipmentStatus.SHIPPING,
  })
  status: ShipmentStatus;

  @Column({ name: 'estimated_arrival', nullable: true })
  estimatedArrival?: Date;

  @OneToMany(() => PurchaseOrder, (po) => po.shipment)
  purchaseOrders?: PurchaseOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
