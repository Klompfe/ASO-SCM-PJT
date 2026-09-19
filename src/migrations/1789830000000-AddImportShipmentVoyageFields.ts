import { MigrationInterface, QueryRunner } from "typeorm";

// PR-124: 수입통관 문서에 선적항(POL)/최종 도착항(POD)/출항일(ETD)/도착예정일(ETA)/선명을 추가한다. 전부 nullable.
export class AddImportShipmentVoyageFields1789830000000 implements MigrationInterface {
    name = 'AddImportShipmentVoyageFields1789830000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD "pol" character varying`);
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD "pod" character varying`);
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD "etd" date`);
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD "eta" date`);
        await queryRunner.query(`ALTER TABLE "import_shipments" ADD "vessel" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP COLUMN "vessel"`);
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP COLUMN "eta"`);
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP COLUMN "etd"`);
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP COLUMN "pod"`);
        await queryRunner.query(`ALTER TABLE "import_shipments" DROP COLUMN "pol"`);
    }

}
