import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MasterStyle } from './master-style.entity';

// 계약서 발행 상태/이력만 기록한다(PR-049) — 실제 문서(PDF 등) 생성은 이번 범위 밖.
@Entity()
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @ManyToOne(() => MasterStyle)
  @JoinColumn({ name: 'styleNo', referencedColumnName: 'styleNo' })
  style: MasterStyle;

  @CreateDateColumn()
  issuedAt: Date;

  @Column({ nullable: true })
  notes: string | null;
}
