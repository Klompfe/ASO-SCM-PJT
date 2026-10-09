import { MigrationInterface, QueryRunner } from "typeorm";

// PR-185: 발주 ↔ 스타일 선택적 연결(두 트랙) + 단가표(USD) 참고단가.
// 안전 규칙: 기존 컬럼/데이터는 건드리지 않는다. purchase_order에 nullable 컬럼만
// 추가(styleNo/referenceUnitPriceUsd/referencePriceSource/referencePriceNote)하고,
// 새 테이블(brand_price_rules)만 만든다. 기존 발주 행의 styleNo는 전부 null로 남는다
// (이름/품목으로 추측해 백필하지 않음 — "스타일 미연결" 트랙으로 그대로 둔다).
export class AddPurchaseOrderStyleAndPricing1791700000000 implements MigrationInterface {
    name = 'AddPurchaseOrderStyleAndPricing1791700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "styleNo" character varying`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_purchase_order_styleNo" ON "purchase_order" ("styleNo")`);

        // 단가표(USD) 참고단가 — PurchaseOrder.unitPrice(KRW)와 완전히 별개 컬럼. 서버가
        // 자동으로 채우지 않고(안전모드), 사람이 고른/입력한 후보·값·근거만 저장한다.
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "referenceUnitPriceUsd" numeric`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "referencePriceSource" character varying`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "referencePriceNote" text`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "brand_price_rules" (
                "id" SERIAL NOT NULL,
                "brandName" character varying NOT NULL,
                "categoryKeyword" character varying NOT NULL,
                "priceUsd" numeric NOT NULL,
                "unit" character varying NOT NULL,
                "note" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_brand_price_rules_brand_category" UNIQUE ("brandName", "categoryKeyword"),
                CONSTRAINT "PK_brand_price_rules" PRIMARY KEY ("id")
            )
        `);

        // 시드는 제시된 3건만 — 뮤트 전용가(2026-10-05 확정). 그 외 시드 금지.
        await queryRunner.query(`
            INSERT INTO "brand_price_rules" ("brandName", "categoryKeyword", "priceUsd", "unit", "note") VALUES
            ('뮤트', '겉감', 1.00, 'YD', '뮤트 전용가 — 제시님 확정 2026-10-05'),
            ('뮤트', '안감', 0.15, 'YD', '뮤트 전용가 — 제시님 확정 2026-10-05'),
            ('뮤트', '행어', 0.001, 'EA', '뮤트 전용가 — 제시님 확정 2026-10-05')
            ON CONFLICT ("brandName", "categoryKeyword") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "brand_price_rules"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN IF EXISTS "referencePriceNote"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN IF EXISTS "referencePriceSource"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN IF EXISTS "referenceUnitPriceUsd"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_order_styleNo"`);
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN IF EXISTS "styleNo"`);
    }
}
