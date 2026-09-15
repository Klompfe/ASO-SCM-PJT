import { MigrationInterface, QueryRunner } from "typeorm";

export class SupplierAutoCode1789474568839 implements MigrationInterface {
    name = 'SupplierAutoCode1789474568839'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suppliers" ADD "abbrCode" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "abbrCode"`);
    }

}
