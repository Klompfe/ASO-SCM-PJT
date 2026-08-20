import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Bom } from '../../boms/entities/bom.entity';

export enum ItemType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  FINISHED_GOOD = 'FINISHED_GOOD',
  SUB_MATERIAL = 'SUB_MATERIAL',
}

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    default: ItemType.RAW_MATERIAL,
  })
  type: ItemType;

  @Column({ default: 'EA', nullable: true })
  unit?: string;

  @Column({ nullable: true })
  spec?: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => Bom, (bom) => bom.parentItem)
  parentBoms?: Bom[];

  @OneToMany(() => Bom, (bom) => bom.childItem)
  childBoms?: Bom[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}