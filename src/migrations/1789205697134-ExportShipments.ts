import { MigrationInterface, QueryRunner } from "typeorm";

export class ExportShipments1789205697134 implements MigrationInterface {
    name = 'ExportShipments1789205697134'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "export_shipment_lines" ("id" SERIAL NOT NULL, "exportShipmentId" integer NOT NULL, "styleNo" character varying NOT NULL, "packingReceiptId" integer NOT NULL, "description" character varying NOT NULL, "hsCode" character varying, "qty" numeric NOT NULL, "unit" character varying NOT NULL, "unitPrice" numeric, "amount" numeric, "netWeight" numeric, "grossWeight" numeric, "packageCount" integer, "packageType" character varying, CONSTRAINT "PK_1380fe41116c099fc282d470632" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "export_shipments" ("id" SERIAL NOT NULL, "styleNos" text, "status" character varying NOT NULL DEFAULT 'DRAFT', "sheetNo" character varying, "invoiceDate" date, "shipperInfo" character varying, "consigneeInfo" character varying, "portOfLoading" character varying, "finalDestination" character varying, "carrier" character varying, "sailingDate" date, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3ea1a4e9b51de3a3a7d70a152fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD CONSTRAINT "FK_822f64cc21509ac8e84ae981f12" FOREIGN KEY ("exportShipmentId") REFERENCES "export_shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950" FOREIGN KEY ("packingReceiptId") REFERENCES "packing_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP CONSTRAINT "FK_822f64cc21509ac8e84ae981f12"`);
        await queryRunner.query(`DROP TABLE "export_shipments"`);
        await queryRunner.query(`DROP TABLE "export_shipment_lines"`);
    }

}
