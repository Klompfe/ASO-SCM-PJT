import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderProcessAndShipmentTracking1789049289855 implements MigrationInterface {
    name = 'OrderProcessAndShipmentTracking1789049289855'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "order_shipments" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "installmentNo" integer NOT NULL, "plannedShipDate" date NOT NULL, "actualShipDate" date, "quantity" numeric NOT NULL, "remark" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5ad728999743f02e46c31e8189c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "order_process_stages" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "stage" character varying NOT NULL, "startDate" date, "finishDate" date, "targetQty" numeric, "completedQty" numeric NOT NULL DEFAULT '0', "lineOrTeam" character varying, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_63a471b89bc9e7ec06afad96e2e" UNIQUE ("styleNo", "stage"), CONSTRAINT "PK_70e13bab83aba4001d52d2e4bd7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "order_shipments" ADD CONSTRAINT "FK_4fa89e8a0e08460b408a14c5c6d" FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_process_stages" ADD CONSTRAINT "FK_452fb427bc8f8dd8fe16673bf57" FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_process_stages" DROP CONSTRAINT "FK_452fb427bc8f8dd8fe16673bf57"`);
        await queryRunner.query(`ALTER TABLE "order_shipments" DROP CONSTRAINT "FK_4fa89e8a0e08460b408a14c5c6d"`);
        await queryRunner.query(`DROP TABLE "order_process_stages"`);
        await queryRunner.query(`DROP TABLE "order_shipments"`);
    }

}
