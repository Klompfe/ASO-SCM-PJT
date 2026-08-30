import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Style, Material } from '../../master/entities/master.entities';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';

@Entity('tx_bom')
export class Bom {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Style)
  style: Style;

  @ManyToOne(() => Material)
  material: Material;

  @Column('decimal')
  consumption: number; // 소요량

  @Column()
  calculationMethod: string; // 예: 'FIXED', 'RATIO'

  @Column({ nullable: true })
  traceabilityKey: string; // Raw Data를 추적하기 위한 키

  @Column({ default: 1 })
  bomVersion: number;

  @Column({ nullable: true })
  changeReason: string;

  @CreateDateColumn()
  changedAt: Date;

  @Column({ nullable: true })
  changedBy: string;
}

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
