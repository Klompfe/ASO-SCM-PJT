import { MigrationInterface, QueryRunner } from "typeorm";

export class CashVoucher1789479706191 implements MigrationInterface {
    name = 'CashVoucher1789479706191'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "cash_vouchers" ("id" SERIAL NOT NULL, "voucherType" character varying NOT NULL, "voucherDate" date NOT NULL, "amount" numeric NOT NULL, "counterpartyName" character varying NOT NULL, "counterpartyBuyerId" integer, "counterpartySupplierId" integer, "account" character varying NOT NULL, "category" character varying NOT NULL, "relatedPurchaseOrderId" integer, "relatedProductionContractId" integer, "note" text, "createdBy" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e699f9b1dc3ea62a3a44b7d31d4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" ADD CONSTRAINT "FK_07b7a9a6aadd7152f40c5622e95" FOREIGN KEY ("counterpartyBuyerId") REFERENCES "buyers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" ADD CONSTRAINT "FK_64e7e594c9b346abd4547f7dcf1" FOREIGN KEY ("counterpartySupplierId") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" ADD CONSTRAINT "FK_207cbffe4d4ac41d14e1899c6bb" FOREIGN KEY ("relatedPurchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" ADD CONSTRAINT "FK_4d147d62ee566b3da349d43d582" FOREIGN KEY ("relatedProductionContractId") REFERENCES "production_contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" ADD CONSTRAINT "FK_885af6d84f2be3c584df90d34d9" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cash_vouchers" DROP CONSTRAINT "FK_885af6d84f2be3c584df90d34d9"`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" DROP CONSTRAINT "FK_4d147d62ee566b3da349d43d582"`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" DROP CONSTRAINT "FK_207cbffe4d4ac41d14e1899c6bb"`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" DROP CONSTRAINT "FK_64e7e594c9b346abd4547f7dcf1"`);
        await queryRunner.query(`ALTER TABLE "cash_vouchers" DROP CONSTRAINT "FK_07b7a9a6aadd7152f40c5622e95"`);
        await queryRunner.query(`DROP TABLE "cash_vouchers"`);
    }

}
