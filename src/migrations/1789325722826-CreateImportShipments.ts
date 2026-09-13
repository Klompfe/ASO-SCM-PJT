import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateImportShipments1789325722826 implements MigrationInterface {
    name = 'CreateImportShipments1789325722826'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "import_shipment_lines" ("id" SERIAL NOT NULL, "importShipmentId" integer NOT NULL, "itemType" character varying NOT NULL, "composition" character varying NOT NULL, "fabricType" character varying NOT NULL DEFAULT '직물', "hsCode" character varying, "qty" numeric NOT NULL, "unit" character varying NOT NULL, "unitPrice" numeric, "amount" numeric, "netWeight" numeric, "grossWeight" numeric, "packageCount" integer, CONSTRAINT "PK_92fa8d8284f1da128130b7dc485" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "import_shipments" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "invoiceNo" character varying, "invoiceDate" date, "status" character varying NOT NULL DEFAULT 'PENDING_CLEARANCE', "clearedAt" date, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c31fc33c768cf769dd26361cc2a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "import_shipment_lines" ADD CONSTRAINT "FK_d89ef6a41136576ebfef6933155" FOREIGN KEY ("importShipmentId") REFERENCES "import_shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD CONSTRAINT "FK_3b1f7ba9c220152d9395854a784" FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP CONSTRAINT "FK_3b1f7ba9c220152d9395854a784"`);
        await queryRunner.query(`ALTER TABLE "import_shipment_lines" DROP CONSTRAINT "FK_d89ef6a41136576ebfef6933155"`);
        await queryRunner.query(`DROP TABLE "import_shipments"`);
        await queryRunner.query(`DROP TABLE "import_shipment_lines"`);
    }

}
