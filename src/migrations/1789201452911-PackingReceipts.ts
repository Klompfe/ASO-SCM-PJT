import { MigrationInterface, QueryRunner } from "typeorm";

export class PackingReceipts1789201452911 implements MigrationInterface {
    name = 'PackingReceipts1789201452911'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "packing_receipt_rolls" ("id" SERIAL NOT NULL, "packingReceiptId" integer NOT NULL, "rollNo" character varying NOT NULL, "color" character varying, "widthCm" numeric, "widthInch" numeric, "grossWeight" numeric, "netWeight" numeric, "thickness" numeric, CONSTRAINT "PK_3c647bd93f1860a0c132f7c3edc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "packing_receipt_cartons" ("id" SERIAL NOT NULL, "packingReceiptId" integer NOT NULL, "cartonNo" character varying NOT NULL, "color" character varying, "size" character varying, "lotNo" character varying, "qty" integer NOT NULL DEFAULT '0', "itemName" character varying, "weightKg" numeric, CONSTRAINT "PK_c4479547062d9978ce04d3b954a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "packing_receipts" ("id" SERIAL NOT NULL, "purchaseOrderId" integer NOT NULL, "materialCategory" character varying NOT NULL, "receivedDate" date, "remark" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9a0cece4c59d8b5d4158dd6b610" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "packing_receipt_rolls" ADD CONSTRAINT "FK_758e48ce802d55c1fb287279786" FOREIGN KEY ("packingReceiptId") REFERENCES "packing_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "packing_receipt_cartons" ADD CONSTRAINT "FK_242c0d25a59c992fa0eeab781a6" FOREIGN KEY ("packingReceiptId") REFERENCES "packing_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "packing_receipts" ADD CONSTRAINT "FK_c883b0d4d539459971b2789df68" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "packing_receipts" DROP CONSTRAINT "FK_c883b0d4d539459971b2789df68"`);
        await queryRunner.query(`ALTER TABLE "packing_receipt_cartons" DROP CONSTRAINT "FK_242c0d25a59c992fa0eeab781a6"`);
        await queryRunner.query(`ALTER TABLE "packing_receipt_rolls" DROP CONSTRAINT "FK_758e48ce802d55c1fb287279786"`);
        await queryRunner.query(`DROP TABLE "packing_receipts"`);
        await queryRunner.query(`DROP TABLE "packing_receipt_cartons"`);
        await queryRunner.query(`DROP TABLE "packing_receipt_rolls"`);
    }

}
