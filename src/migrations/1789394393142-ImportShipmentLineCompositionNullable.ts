import { MigrationInterface, QueryRunner } from "typeorm";

export class ImportShipmentLineCompositionNullable1789394393142 implements MigrationInterface {
    name = 'ImportShipmentLineCompositionNullable1789394393142'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "import_shipment_lines" ALTER COLUMN "composition" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "import_shipment_lines" ALTER COLUMN "composition" SET NOT NULL`);
    }

}
