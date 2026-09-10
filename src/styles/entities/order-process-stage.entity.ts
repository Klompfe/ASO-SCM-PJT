import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MasterStyle } from './master-style.entity';

export enum ProcessStageName {
  CUTTING = 'CUTTING',
  SEWING = 'SEWING',
  PACKING = 'PACKING',
}

// 재단/봉제/포장 3단계로 좁힌 이유(PR-063): 실제 공장 생산일보("태일 생산일보")를 분석한
// 결과, 자재입고는 별도 단계가 아니라 PO/Inventory에서 자동 파생되고(OrderProcessStagesService.
// getMaterialReadiness), 검사(QC)는 이 보고서에 컬럼 자체가 없다(추후 별도 기능으로 구현 예정).
// 날짜뿐 아니라 완료수량(completedQty)까지 함께 두는 이유도 같은 보고서 근거 — 실제 생산은
// 하루 만에 끝나지 않고 며칠에 걸쳐 부분적으로(예: 재단 1,372개 중 오늘까지 900개) 진행된다.
@Entity('order_process_stages')
@Unique(['styleNo', 'stage'])
export class OrderProcessStage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @ManyToOne(() => MasterStyle)
  @JoinColumn({ name: 'styleNo', referencedColumnName: 'styleNo' })
  style: MasterStyle;

  @Column({ type: 'varchar', enum: ProcessStageName })
  stage: ProcessStageName;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  finishDate: Date | null;

  // 발주량과 다를 수 있다(예: 재단은 로스 버퍼를 감안해 발주량보다 약간 많이 잡는 게 실무
  // 관행) — 시스템에서 발주량과 비교 검증하지 않고 입력값을 그대로 받는다.
  @Column({ type: 'decimal', nullable: true })
  targetQty: number | null;

  @Column({ type: 'decimal', default: 0 })
  completedQty: number;

  // 실제 생산일보의 "Chuyền"(라인) 컬럼 — 주로 봉제 단계에 쓰이지만 어느 단계에나 선택 입력 가능.
  @Column({ nullable: true })
  lineOrTeam: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
