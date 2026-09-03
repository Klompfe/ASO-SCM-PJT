import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { BomItem } from './bom-item.entity';

@Entity('bom_master')
export class Bom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bomNo: string;

  @Column()
  version: string;

  @ManyToOne(() => MasterStyle, (style) => style.boms)
  style: MasterStyle;

  @OneToMany(() => BomItem, (bomItem) => bomItem.bom)
  items: BomItem[];
}
