import { MigrationInterface, QueryRunner } from "typeorm";

// PR-176: 발주 색상/사이즈별 상세 줄. 기존 발주는 라인이 없고 quantity만 쓰므로 데이터
// 변경 없이 테이블만 추가한다(하위호환). 수량은 PurchaseOrder.quantity(int)와 맞춰 int.
export class AddPurchaseOrderLines1791200000000 implements MigrationInterface {
    name = 'AddPurchaseOrderLines1791200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "purchase_order_lines" (
                "id" SERIAL NOT NULL,
                "purchaseOrderId" integer NOT NULL,
                "color" character varying,
                "size" character varying,
                "qty" integer NOT NULL,
                CONSTRAINT "PK_purchase_order_lines" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "purchase_order_lines"
            ADD CONSTRAINT "FK_purchase_order_lines_po" FOREIGN KEY ("purchaseOrderId")
            REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`CREATE INDEX "IDX_purchase_order_lines_po" ON "purchase_order_lines" ("purchaseOrderId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "purchase_order_lines"`);
    }

}
