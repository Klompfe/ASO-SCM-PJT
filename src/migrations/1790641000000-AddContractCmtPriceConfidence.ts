import { MigrationInterface, QueryRunner } from "typeorm";

// PR-166: 계약서 발행 시 CMT매입단가 표준가격 자동 조회 결과(어떤 근거로
// cmtPrice를 채웠는지/왜 못 채웠는지)를 남기기 위한 컬럼 2개 추가.
export class AddContractCmtPriceConfidence1790641000000 implements MigrationInterface {
    name = 'AddContractCmtPriceConfidence1790641000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" ADD "cmtPriceConfidence" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "cmtPriceNote" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "cmtPriceNote"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "cmtPriceConfidence"`);
    }

}
