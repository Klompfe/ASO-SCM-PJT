import { MigrationInterface, QueryRunner } from "typeorm";

export class ContractApprovalWorkflow1789140107994 implements MigrationInterface {
    name = 'ContractApprovalWorkflow1789140107994'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" ADD "status" character varying NOT NULL DEFAULT 'PENDING_APPROVAL'`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "totalQty" numeric`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "targetRdd" date`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "factory" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "buyer" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "productionType" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "cmtPrice" numeric`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "fobPrice" numeric`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "approvedByUserId" integer`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "approvedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "triggeredByWorkOrderSpecId" integer`);
        await queryRunner.query(`ALTER TABLE "contract" ADD CONSTRAINT "FK_fce9f213ec9b90cb0cdaf4b3d08" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" DROP CONSTRAINT "FK_fce9f213ec9b90cb0cdaf4b3d08"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "triggeredByWorkOrderSpecId"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "approvedAt"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "approvedByUserId"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "fobPrice"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "cmtPrice"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "productionType"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "buyer"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "factory"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "targetRdd"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "totalQty"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "status"`);
    }

}
