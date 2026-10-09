import { MigrationInterface, QueryRunner } from "typeorm";

// PR-183: 공급업체 "주요품목"(개별 Item)을 포괄적 품목군(실·테이프 …)으로 전환하기 위한 추가 전용 마이그레이션.
// 안전 규칙: 기존 테이블/컬럼/데이터(supplier_main_items 포함)는 건드리지 않는다.
// 새 테이블(material_categories, supplier_material_categories)과 nullable 컬럼(items.categoryId)만 추가한다.
// 모든 DDL은 IF NOT EXISTS / 존재 검사로 작성해 반복 실행해도 안전하다.
export class AddMaterialCategories1791500000000 implements MigrationInterface {
    name = 'AddMaterialCategories1791500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "material_categories" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "sortOrder" integer NOT NULL DEFAULT 0,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_material_categories_name" UNIQUE ("name"),
                CONSTRAINT "PK_material_categories" PRIMARY KEY ("id")
            )
        `);

        // 시드는 제시된 10개만. 이미 있는 이름은 건너뛴다(반복 실행 안전).
        await queryRunner.query(`
            INSERT INTO "material_categories" ("name", "sortOrder", "isActive") VALUES
            ('겉감', 1, true),
            ('안감', 2, true),
            ('심지', 3, true),
            ('실', 4, true),
            ('테이프', 5, true),
            ('밴드', 6, true),
            ('라벨', 7, true),
            ('택', 8, true),
            ('스티커', 9, true),
            ('기타', 10, true)
            ON CONFLICT ("name") DO NOTHING
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "supplier_material_categories" (
                "supplierId" integer NOT NULL,
                "categoryId" integer NOT NULL,
                CONSTRAINT "PK_supplier_material_categories" PRIMARY KEY ("supplierId", "categoryId")
            )
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_smc_supplier') THEN
                    ALTER TABLE "supplier_material_categories"
                        ADD CONSTRAINT "FK_smc_supplier" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_smc_category') THEN
                    ALTER TABLE "supplier_material_categories"
                        ADD CONSTRAINT "FK_smc_category" FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE CASCADE;
                END IF;
            END $$
        `);

        // 기존 품목은 비워 둔다(자동 추측 금지). 새 컬럼은 nullable이라 기존 행이 깨지지 않는다.
        await queryRunner.query(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "categoryId" integer`);
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_items_category') THEN
                    ALTER TABLE "items"
                        ADD CONSTRAINT "FK_items_category" FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE SET NULL;
                END IF;
            END $$
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 이 마이그레이션이 추가한 것만 되돌린다. supplier_main_items 등 기존 구조는 건드리지 않는다.
        await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_category"`);
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN IF EXISTS "categoryId"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "supplier_material_categories"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "material_categories"`);
    }
}
