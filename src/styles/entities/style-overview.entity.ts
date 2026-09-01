import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { MasterStyle } from './master-style.entity';

@Entity()
export class StyleOverview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  factory: string;

  @Column('decimal')
  totalQty: number;

  @Column()
  buyer: string;

  @Column()
  firstShipDate: Date;

  @Column()
  status: string;

  @OneToOne(() => MasterStyle, (style) => style.overview)
  style: MasterStyle;
}
