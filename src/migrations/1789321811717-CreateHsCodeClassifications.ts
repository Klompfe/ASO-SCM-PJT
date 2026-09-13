import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateHsCodeClassifications1789321811717 implements MigrationInterface {
    name = 'CreateHsCodeClassifications1789321811717'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "hs_code_classifications" ("id" SERIAL NOT NULL, "itemType" character varying NOT NULL, "fabricType" character varying NOT NULL, "composition" character varying NOT NULL, "hsCode" character varying NOT NULL, "note" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3dab57a287c119caae09f1456ce" UNIQUE ("itemType", "fabricType", "composition"), CONSTRAINT "PK_bca9d66f8ffb0ff5b3efc915b61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "style_hs_code_mappings" ("id" SERIAL NOT NULL, "styleNo" character varying NOT NULL, "classificationId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7750742eabc9002f74bc4dcdd78" UNIQUE ("styleNo"), CONSTRAINT "PK_6b834b07f214c039f9d5b33e8d3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "style_hs_code_mappings" ADD CONSTRAINT "FK_4542071cc3e2383eb11d222775b" FOREIGN KEY ("classificationId") REFERENCES "hs_code_classifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "style_hs_code_mappings" DROP CONSTRAINT "FK_4542071cc3e2383eb11d222775b"`);
        await queryRunner.query(`DROP TABLE "style_hs_code_mappings"`);
        await queryRunner.query(`DROP TABLE "hs_code_classifications"`);
    }

}
