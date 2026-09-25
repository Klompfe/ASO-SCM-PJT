import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogs1790340414176 implements MigrationInterface {
    name = 'CreateAuditLogs1790340414176'

    // 참고: migration:generate가 이 변경과 무관한 기존 drift(status_codes 유니크 제약의
    // 자동생성 이름 불일치 — PR-140 때 수동으로 지은 이름과 TypeORM 관례가 계산하는
    // 이름이 달라서 생기는 것, 동작에는 영향 없음)도 함께 잡아냈는데, 이번 PR 범위가
    // 아니라 여기서는 audit_logs 생성만 남기고 뺐다.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "userId" integer, "ip" character varying, "entityType" character varying NOT NULL, "entityId" character varying, "action" character varying NOT NULL, "beforeValue" text, "afterValue" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
