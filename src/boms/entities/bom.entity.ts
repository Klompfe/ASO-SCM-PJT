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

@Entity('boms')
export class Bom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  parentItemId: number;

  @Column({ type: 'integer', nullable: true })
  childItemId: number;

  @Column({ type: 'real', default: 1 })
  quantity: number;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentItemId' })
  parentItem: Item;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'childItemId' })
  childItem: Item;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}