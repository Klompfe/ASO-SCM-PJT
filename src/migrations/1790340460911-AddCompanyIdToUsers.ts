import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyIdToUsers1790340460911 implements MigrationInterface {
    name = 'AddCompanyIdToUsers1790340460911'

    // audit_logs 생성은 이보다 먼저 실행되는 CreateAuditLogs1790340414176에서 이미
    // 처리한다(둘 다 같은 시점에 아직 미적용 상태라 migration:generate가 한 번에 같이
    // 잡아냈다) — 여기서는 companyId 컬럼 추가만 남긴다. status_codes 제약 이름
    // drift는 이번 PR과 무관해 뺐다(CreateAuditLogs 쪽 주석 참고).
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "companyId" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "companyId"`);
    }

}
