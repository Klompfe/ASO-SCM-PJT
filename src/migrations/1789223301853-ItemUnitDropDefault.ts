import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemUnitDropDefault1789223301853 implements MigrationInterface {
    name = 'ItemUnitDropDefault1789223301853'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" ALTER COLUMN "unit" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" ALTER COLUMN "unit" SET DEFAULT 'EA'`);
    }

}
