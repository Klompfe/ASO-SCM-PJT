import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// PR-151: "누가 언제 무엇을 바꿨는지" 기록. 지금은 이미 MANAGER/ADMIN으로 제한돼
// 민감 CUD로 분류된 15개 API(styles/contracts/status-codes/hs-code-classifications/
// boms/users/export-shipment-defaults 컨트롤러)에만 적용한다 — 전체 API로 한 번에
// 확장하면 로그가 너무 많아지고 검증도 어렵다(요청 사양).
//
// userId는 User에 대한 FK를 걸지 않는다 — 감사 로그는 그 행위를 한 사용자 계정이
// 나중에 삭제되더라도 "누가 그랬는지"의 기록으로 남아야 하는 append-only 로그라,
// FK로 묶으면 사용자 삭제 시 로그까지 끌려 지워지거나(CASCADE) 삭제 자체가 막히는
// (RESTRICT) 문제가 생긴다(contract.entity.ts의 triggeredBySalesOrderSpecId와 같은 이유).
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity('audit_logs')
export class AuditLogEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number | null;

  @Column({ nullable: true })
  ip: string | null;

  // 사람이 읽을 수 있는 대상 종류 이름(예: 'MasterStyle', 'Contract') — 실제 테이블명과
  // 반드시 같을 필요는 없다(audit-log.decorator.ts의 @AuditLog() 호출부에서 지정).
  @Column()
  entityType: string;

  // 대상 식별자(문자열로 통일 — styleNo처럼 PK가 문자열인 엔티티도 있어 number로
  // 고정할 수 없다). 식별자를 특정할 수 없는 요청(예: 일괄 승인)은 null로 남는다.
  @Column({ nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', enum: AuditAction })
  action: AuditAction;

  // 변경 전 값 — :id류 단일 파라미터 라우트에서 처리 전에 조회해둔 DB 행의 스냅샷.
  // 일괄 처리(bulk-approve)나 생성(POST, 대상이 아직 없음) 등 "이전 상태"를 특정할 수
  // 없는 경우 null이다. simple-json은 TypeORM이 SQLite/Postgres 양쪽에서 텍스트로
  // 저장하고 조회 시 자동으로 JSON.parse/stringify해준다(이 프로젝트에 jsonb 전례가
  // 없어, 테스트(SQLite)와 운영(Postgres) 양쪽에서 동일하게 동작하는 타입을 골랐다).
  @Column({ type: 'simple-json', nullable: true })
  beforeValue: unknown;

  // 변경 후 값 — 핸들러가 실제로 반환한 응답 본문 그대로(성공 메시지만 반환하는
  // 삭제 API는 그 메시지가 저장된다 — 삭제된 행 자체는 beforeValue에 남는다).
  @Column({ type: 'simple-json', nullable: true })
  afterValue: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
