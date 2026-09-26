import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MasterStyle } from './master-style.entity';
import { ProductionType } from './style-overview.entity';
import { User } from '../../users/entities/user.entity';

export enum ContractStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

// 계약서 발행 상태/이력을 기록한다(PR-049). PR-066부터는 수주 등록(작업지시서 업로드) 시 자동으로
// PENDING_APPROVAL 브랜치가 생성되고(work-orders.service.ts commitAnalysis), ADMIN
// 이상만 승인/거절할 수 있다 — 실제 문서(PDF 등) 생성은 여전히 이번 범위 밖.
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

  @Column({
    type: 'varchar',
    enum: ContractStatus,
    default: ContractStatus.PENDING_APPROVAL,
  })
  status: ContractStatus;

  // 등록 시점 StyleOverview 값의 스냅샷 — 이후 StyleOverview가 바뀌어도 이 계약이
  // 승인 당시 어떤 조건이었는지 그대로 남아야 하므로 참조가 아니라 값 복사로 둔다.
  @Column({ type: 'decimal', nullable: true })
  totalQty: number | null;

  @Column({ type: 'date', nullable: true })
  targetRdd: Date | null;

  @Column({ nullable: true })
  factory: string | null;

  @Column({ nullable: true })
  buyer: string | null;

  @Column({ type: 'varchar', enum: ProductionType, nullable: true })
  productionType: ProductionType | null;

  @Column({ type: 'decimal', nullable: true })
  cmtPrice: number | null;

  @Column({ type: 'decimal', nullable: true })
  fobPrice: number | null;

  @Column({ nullable: true })
  approvedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedBy: User | null;

  // Date 프로퍼티의 컬럼 타입을 명시하지 않는 이유: 'timestamp'는 sqlite가 지원하지
  // 않는다(DataTypeNotSupportedError) — style-overview.entity.ts의 firstShipDate와
  // 동일하게 타입을 생략해 TypeORM이 드라이버별 기본 타입(sqlite: datetime,
  // postgres: timestamp)을 쓰게 한다.
  @Column({ nullable: true })
  approvedAt: Date | null;

  // 이 계약 브랜치를 만든 수주 등록(작업지시서 업로드, SalesOrderSpec)의 id — 수동 발행(POST /contracts)된
  // 계약은 null로 남는다. 정식 FK 관계는 두지 않는다(추적용 정보일 뿐, 조인해서 쓰지 않음).
  // PR-133: triggeredByWorkOrderSpecId에서 이름을 바꿨다(마이그레이션으로 컬럼 RENAME, 값 보존).
  @Column({ nullable: true })
  triggeredBySalesOrderSpecId: number | null;
}
