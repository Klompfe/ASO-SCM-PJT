import { MigrationInterface, QueryRunner } from "typeorm";

export class ExportShipmentImport1789225696839 implements MigrationInterface {
    name = 'ExportShipmentImport1789225696839'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipments" ADD "source" character varying NOT NULL DEFAULT 'GENERATED'`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ALTER COLUMN "packingReceiptId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950" FOREIGN KEY ("packingReceiptId") REFERENCES "packing_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ALTER COLUMN "packingReceiptId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD CONSTRAINT "FK_0822ff50ae3dea1b5eeebead950" FOREIGN KEY ("packingReceiptId") REFERENCES "packing_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "export_shipments" DROP COLUMN "source"`);
    }

}
