import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { WorkOrderSizeSpecRow } from './work-order-size-spec-row.entity';

// 작업지시서 AI 분석의 "작업명세" — 사이즈 스펙 표(WorkOrderSizeSpecRow)와 달리
// 손글씨 봉제/후가공 지시사항은 표로 구조화하기 어려워 자유 텍스트로 보관한다.
@Entity()
export class WorkOrderSpec {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @Column({ type: 'text', nullable: true })
  workNotes: string | null;

  @OneToMany(() => WorkOrderSizeSpecRow, (row) => row.spec, { cascade: true })
  sizeSpecs: WorkOrderSizeSpecRow[];

  @CreateDateColumn()
  createdAt: Date;
}
