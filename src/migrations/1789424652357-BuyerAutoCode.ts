import { MigrationInterface, QueryRunner } from "typeorm";

export class BuyerAutoCode1789424652357 implements MigrationInterface {
    name = 'BuyerAutoCode1789424652357'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "buyers" ADD "brandCode" character varying`);
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "contactPerson" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "contactPhone" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "country" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "country" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "contactPhone" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "buyers" ALTER COLUMN "contactPerson" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "buyers" DROP COLUMN "brandCode"`);
    }

}
