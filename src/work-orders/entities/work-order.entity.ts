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
import { User } from '../../users/entities/user.entity';
import { WorkOrderStatus } from './work-order-status.enum';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // DB 컬럼과 TS 타입 모두 string으로 명시적 통일
  @Column({ type: 'varchar', length: 50, unique: true })
  orderNumber: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'int' })
  targetQuantity: number;

  @Column({ type: 'int', default: 0 })
  producedQuantity: number;

  @Column({
    type: 'enum',
    enum: WorkOrderStatus,
    default: WorkOrderStatus.PENDING,
  })
  status: WorkOrderStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}