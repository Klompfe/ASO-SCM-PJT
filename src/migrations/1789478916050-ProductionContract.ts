import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductionContract1789478916050 implements MigrationInterface {
    name = 'ProductionContract1789478916050'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "production_contracts" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "manufacturerId" integer NOT NULL, "priceSource" character varying NOT NULL, "cmtPrice" numeric, "priceStatus" character varying NOT NULL, "quantity" numeric NOT NULL, "contractDate" date NOT NULL, "note" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3478e2e736e90f6ee60e2015e59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "production_contracts" ADD CONSTRAINT "FK_50f7ef4f94ab869771d1be19721" FOREIGN KEY ("manufacturerId") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "production_contracts" DROP CONSTRAINT "FK_50f7ef4f94ab869771d1be19721"`);
        await queryRunner.query(`DROP TABLE "production_contracts"`);
    }

}
