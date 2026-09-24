import { MigrationInterface, QueryRunner } from 'typeorm';

// PR-140: WorkOrderStatus enum(work-order.entity.ts)의 기존 값들을 그대로 domain='WORK_ORDER'
// 상태코드로 시드한다 — code는 기존 enum 값과 정확히 같아야 WorkOrder.status(varchar) 컬럼의
// 기존 데이터가 새 마스터 테이블 기준으로도 그대로 유효한 값으로 남는다(데이터 보존 원칙).
// 이 배열이 유일한 출처(source of truth)라 마이그레이션 SQL과 테스트(work-order-status-seed.
// migration.spec.ts) 양쪽이 이 값을 그대로 참조한다.
export const WORK_ORDER_STATUS_SEED: ReadonlyArray<{ code: string; label: string; sortOrder: number }> = [
  { code: 'PENDING', label: '대기', sortOrder: 1 },
  { code: 'IN_PROGRESS', label: '진행중', sortOrder: 2 },
  { code: 'COMPLETED', label: '완료', sortOrder: 3 },
  { code: 'CANCELLED', label: '취소', sortOrder: 4 },
];

export class CreateStatusCodes1789850000000 implements MigrationInterface {
  name = 'CreateStatusCodes1789850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "status_codes" ("id" SERIAL NOT NULL, "domain" character varying NOT NULL, "code" character varying NOT NULL, "label" character varying NOT NULL, "sortOrder" integer NOT NULL DEFAULT 0, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_status_codes_domain_code" UNIQUE ("domain", "code"), CONSTRAINT "PK_status_codes_id" PRIMARY KEY ("id"))`,
    );

    const values = WORK_ORDER_STATUS_SEED.map((s) => `('WORK_ORDER', '${s.code}', '${s.label}', ${s.sortOrder})`).join(',\n            ');
    await queryRunner.query(`INSERT INTO "status_codes" ("domain", "code", "label", "sortOrder") VALUES
            ${values}
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "status_codes"`);
  }
}
