import { MigrationInterface, QueryRunner } from "typeorm";

// PR-186: 실/테이프 종류를 BOM 행(785건, 전부 미지정)이 아니라 자재(Item) 단위로 한 번만
// 지정할 수 있게 한다. 안전 규칙: 기존 컬럼/데이터는 건드리지 않는다(nullable 컬럼 2개
// 추가뿐). Item.unit 값도, bom_item_details의 threadType/tapeType도 이 마이그레이션이
// 바꾸지 않는다 — 전부 사람이 화면(D. 일괄 지정)에서 확인하고 적용해야 채워진다.
export class AddItemThreadTapeSubtype1791800000000 implements MigrationInterface {
    name = 'AddItemThreadTapeSubtype1791800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // material_packaging_unit_rules.materialSubType 값(예: COA_SA, OBA_SA_SKU_I_SA)을 그대로 쓴다.
        await queryRunner.query(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "materialSubType" character varying`);
        // 사람이 이 자재를 검토했다는 표시 — 종류를 지정했거나 "실/테이프 아님"으로 확정한 시각.
        await queryRunner.query(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "packagingReviewedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN IF EXISTS "packagingReviewedAt"`);
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN IF EXISTS "materialSubType"`);
    }
}
