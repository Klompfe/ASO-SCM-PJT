import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderNotes1789736386288 implements MigrationInterface {
    name = 'AddPurchaseOrderNotes1789736386288'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD "notes" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN "notes"`);
    }

}
