import { MigrationInterface, QueryRunner } from "typeorm";

// PR-171: 공급업체 "주요품목" 다중 연결 — Supplier<->Item 다대다 조인 테이블.
// 기존 공급업체 행은 아무 영향 없이 그대로 유지되고(새 테이블만 추가), mainItems는
// 자연히 빈 배열로 조회된다. supplier.entity.ts의 @JoinTable 설정과 테이블/컬럼명이
// 정확히 일치해야 한다(TypeORM 기본 네이밍에 기대지 않고 양쪽 다 명시).
export class AddSupplierMainItems1791000000000 implements MigrationInterface {
    name = 'AddSupplierMainItems1791000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "supplier_main_items" (
                "supplierId" integer NOT NULL,
                "itemId" integer NOT NULL,
                CONSTRAINT "PK_supplier_main_items" PRIMARY KEY ("supplierId", "itemId")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "supplier_main_items"
            ADD CONSTRAINT "FK_supplier_main_items_supplier" FOREIGN KEY ("supplierId")
            REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "supplier_main_items"
            ADD CONSTRAINT "FK_supplier_main_items_item" FOREIGN KEY ("itemId")
            REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`CREATE INDEX "IDX_supplier_main_items_supplier" ON "supplier_main_items" ("supplierId")`);
        await queryRunner.query(`CREATE INDEX "IDX_supplier_main_items_item" ON "supplier_main_items" ("itemId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "supplier_main_items"`);
    }

}
