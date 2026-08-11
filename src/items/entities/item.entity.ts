import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Bom } from './bom.entity';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column()
  type!: string;

  @OneToMany(() => Bom, (bom) => bom.parentItem)
  parentBoms!: Bom[];

  @OneToMany(() => Bom, (bom) => bom.childItem)
  childBoms!: Bom[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}