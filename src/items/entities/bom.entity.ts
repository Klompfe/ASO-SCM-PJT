import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Item } from './item.entity';

@Entity('boms')
export class Bom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 상위 품목 (완제품/반제품)
  @ManyToOne(() => Item, (item) => item.parentBoms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_item_id' })
  parentItem: Item;

  // 하위 자재 (반제품/원자재)
  @ManyToOne(() => Item, (item) => item.childBoms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'child_item_id' })
  childItem: Item;

  // 소요량
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;
}