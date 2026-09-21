import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { SalesOrderSizeSpecRow } from './sales-order-size-spec-row.entity';

// PR-133: 수주(고객사로부터 받은 주문) 하나의 "작업명세". 업로드하는 문서의 실물 이름은 "작업지시서"지만 시스템에서는 수주로 부른다
// (내부 생산 실행 지시인 WorkOrder와 혼동되지 않도록 WorkOrderSpec에서 이름을 바꿨다 — 테이블 work_order_spec → sales_order_spec).
// 작업지시서 AI 분석의 "작업명세" — 사이즈 스펙 표(SalesOrderSizeSpecRow)와 달리
// 손글씨 봉제/후가공 지시사항은 표로 구조화하기 어려워 자유 텍스트로 보관한다.
@Entity()
export class SalesOrderSpec {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @Column({ type: 'text', nullable: true })
  workNotes: string | null;

  @OneToMany(() => SalesOrderSizeSpecRow, (row) => row.spec, { cascade: true })
  sizeSpecs: SalesOrderSizeSpecRow[];

  @CreateDateColumn()
  createdAt: Date;
}
