import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Style } from '../../master/entities/master.entities';

@Entity('tx_bom')
export class Bom {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Style)
  style: Style;

  @Column()
  materialName: string;

  @Column('decimal')
  consumption: number; // 소요량

  @Column()
  calculationMethod: string; // 예: 'FIXED', 'RATIO'

  @Column({ nullable: true })
  traceabilityKey: string; // Raw Data를 추적하기 위한 키

  @Column({ default: 1 })
  bomVersion: number;

  @Column({ nullable: true })
  changeReason: string;

  @CreateDateColumn()
  changedAt: Date;

  @Column({ nullable: true })
  changedBy: string;
}
