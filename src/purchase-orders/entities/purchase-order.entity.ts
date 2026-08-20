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

  @Column({
    type: 'varchar',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.PENDING,
  })
  status: PurchaseOrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}