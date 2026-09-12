import { MigrationInterface, QueryRunner } from "typeorm";

export class BuyerMaster1789182750547 implements MigrationInterface {
    name = 'BuyerMaster1789182750547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "buyers" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "contactPerson" character varying NOT NULL, "contactPhone" character varying NOT NULL, "email" character varying, "country" character varying NOT NULL, "address" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8b0cd8816113600bffe87f0a842" UNIQUE ("code"), CONSTRAINT "PK_aff372821d05bac04a18ff8eb87" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "buyers"`);
    }

}
