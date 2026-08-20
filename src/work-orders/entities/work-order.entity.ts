import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';

export enum WorkOrderStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  itemId: number;

  @Column({ type: 'real', default: 1 })
  targetQuantity: number;

  @Column({
    type: 'varchar',
    default: WorkOrderStatus.PENDING,
  })
  status: WorkOrderStatus;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}