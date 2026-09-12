import { MigrationInterface, QueryRunner } from "typeorm";

export class ExportShipmentDefaults1789224346746 implements MigrationInterface {
    name = 'ExportShipmentDefaults1789224346746'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "export_shipment_defaults" ("id" SERIAL NOT NULL, "shipperInfo" character varying, "consigneeInfo" character varying, "portOfLoading" character varying, "finalDestination" character varying, "carrier" character varying, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_436e45cf52c31b6fb5acc326420" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "export_shipment_defaults"`);
    }

}
