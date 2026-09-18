import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGoodsReceiptAndPackingDetail1789739323068 implements MigrationInterface {
    name = 'AddGoodsReceiptAndPackingDetail1789739323068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "import_shipment_packing_details" ("id" SERIAL NOT NULL, "importShipmentId" integer NOT NULL, "styleNo" character varying NOT NULL, "color" character varying NOT NULL, "size" character varying NOT NULL, "qty" numeric NOT NULL, "source" character varying NOT NULL DEFAULT 'MANUAL', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6d53378a846d6095a57b13a3970" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "goods_receipt_lines" ("id" SERIAL NOT NULL, "goodsReceiptId" integer NOT NULL, "packingDetailId" integer NOT NULL, "styleNo" character varying NOT NULL, "color" character varying NOT NULL, "size" character varying NOT NULL, "originalQty" numeric NOT NULL, "adjustedQty" numeric NOT NULL, "adjustmentReason" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7085a869c816a8e59e460783268" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "goods_receipts" ("id" SERIAL NOT NULL, "receiptNo" character varying NOT NULL, "issuedDate" date NOT NULL, "importShipmentId" integer NOT NULL, "remark" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b5ecb431944cead8b620a0344a1" UNIQUE ("receiptNo"), CONSTRAINT "PK_f8cac411be0211f923e1be8534f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "import_shipment_packing_details" ADD CONSTRAINT "FK_5b1c22a803471ef96a47d9234cb" FOREIGN KEY ("importShipmentId") REFERENCES "import_shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "FK_2f202857ff61edffe9afb2b78b8" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "FK_e0248a0fe899a32eacdb04481c3" FOREIGN KEY ("packingDetailId") REFERENCES "import_shipment_packing_details"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "goods_receipts" ADD CONSTRAINT "FK_472dde74aba9ef44daddbc5ea33" FOREIGN KEY ("importShipmentId") REFERENCES "import_shipments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "goods_receipts" DROP CONSTRAINT "FK_472dde74aba9ef44daddbc5ea33"`);
        await queryRunner.query(`ALTER TABLE "goods_receipt_lines" DROP CONSTRAINT "FK_e0248a0fe899a32eacdb04481c3"`);
        await queryRunner.query(`ALTER TABLE "goods_receipt_lines" DROP CONSTRAINT "FK_2f202857ff61edffe9afb2b78b8"`);
        await queryRunner.query(`ALTER TABLE "import_shipment_packing_details" DROP CONSTRAINT "FK_5b1c22a803471ef96a47d9234cb"`);
        await queryRunner.query(`DROP TABLE "goods_receipts"`);
        await queryRunner.query(`DROP TABLE "goods_receipt_lines"`);
        await queryRunner.query(`DROP TABLE "import_shipment_packing_details"`);
    }

}
