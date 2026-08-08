import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ItemType } from './item-type.enum';
import { Bom } from './bom.entity';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: ItemType,
    default: ItemType.RAW_MATERIAL,
  })
  type: ItemType;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 상위 품목일 때 하위 BOM 목록
  @OneToMany(() => Bom, (bom: Bom) => bom.parentItem)
  parentBoms: Bom[];

  // 하위 부품일 때 상위 BOM 목록
  @OneToMany(() => Bom, (bom: Bom) => bom.childItem)
  childBoms: Bom[];
}