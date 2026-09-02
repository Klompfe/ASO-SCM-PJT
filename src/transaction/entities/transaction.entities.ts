import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';

@Entity('tx_receiving')
export class Receiving {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  receivingId: string;

  @Column()
  shipmentBatch: string; // 1차, 2차 등

  @Column('decimal')
  rcvdQty: number;

  @Column('decimal')
  balanceQty: number;

  @ManyToOne(() => PurchaseOrder, (po) => po.id)
  purchaseOrder: PurchaseOrder;

  @Column({ nullable: true })
  traceabilityKey: string;
}
