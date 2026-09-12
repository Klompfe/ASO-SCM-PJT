import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemEnglishNameBomComposition1789198735142 implements MigrationInterface {
    name = 'ItemEnglishNameBomComposition1789198735142'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" ADD "englishName" character varying`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "composition" character varying`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "hsCode" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "hsCode"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "composition"`);
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "englishName"`);
    }

}
