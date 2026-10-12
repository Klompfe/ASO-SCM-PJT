import { MigrationInterface, QueryRunner } from "typeorm";

// PR-188: (1) brand_prefix_rules에 미도 단가표 적용 대상 여부(priceTableCode)와
// 수출서류 원단 라인 단위 기본값(fabricLineUnit)을 추가한다. 둘 다 nullable이고
// 기존 행은 값이 없으면 건드리지 않는다 — 미센스/반에크/루미에반(priceTableCode)과
// 빈폴/에잇세컨즈(fabricLineUnit)만 제시님이 확정한 값으로 채운다(그 외 브랜드는
// null로 남아 기존 동작 그대로). (2) mido_price_items에 isActive를 추가한다 —
// 삭제 API는 만들지 않고(실수 방지) "사용 중지" 토글만 둔다, 기존 행은 전부 true.
export class AddBrandTableCodeAndFabricLineUnit1791900000000 implements MigrationInterface {
    name = 'AddBrandTableCodeAndFabricLineUnit1791900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "priceTableCode" character varying`);
        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" ADD COLUMN IF NOT EXISTS "fabricLineUnit" character varying`);
        await queryRunner.query(`ALTER TABLE "mido_price_items" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`);

        await queryRunner.query(
            `UPDATE "brand_prefix_rules" SET "priceTableCode"='MIDO' WHERE "brandName" IN ('미센스','반에크','루미에반') AND "priceTableCode" IS NULL`,
        );
        await queryRunner.query(
            `UPDATE "brand_prefix_rules" SET "fabricLineUnit"='M' WHERE "brandName" IN ('빈폴','에잇세컨즈') AND "fabricLineUnit" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mido_price_items" DROP COLUMN IF EXISTS "isActive"`);
        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" DROP COLUMN IF EXISTS "fabricLineUnit"`);
        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" DROP COLUMN IF EXISTS "priceTableCode"`);
    }
}
