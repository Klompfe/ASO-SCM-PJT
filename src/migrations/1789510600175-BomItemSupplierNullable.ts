import { MigrationInterface, QueryRunner } from "typeorm";

export class BomItemSupplierNullable1789510600175 implements MigrationInterface {
    name = 'BomItemSupplierNullable1789510600175'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" ALTER COLUMN "supplier" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" ALTER COLUMN "supplier" SET NOT NULL`);
    }

}
