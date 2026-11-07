import { MigrationInterface, QueryRunner } from "typeorm";

// PR-231: 자재명세(BOM) 행의 소요수량을 사람이 직접 지정할 수 있게 한다(현장에서
// 작지/계산값이 실제와 다를 때 정정 — 사용자 요구). 저장 위치는 bom_item_details
// (sheetQty/sheetQtyUnit과 같은 테이블 — "그 행 하나의 소요량 관련 값"이라는 같은
// 성격). 세 컬럼 모두 nullable, 기본값 없음(additive-only) — 기존 행은 전부 NULL이며
// 기존 컬럼/데이터는 건드리지 않는다. "By"(지정한 사람) 컬럼은 추가하지 않는다 —
// 이 코드베이스에 아직 그런 감사(audit) 컬럼 패턴이 없다(PR-231 조사 결과, grep으로
// ReviewedBy/UpdatedBy/CreatedBy/ApprovedBy 전부 0건 확인).
export class AddBomItemManualRequiredQty1792200000000 implements MigrationInterface {
    name = 'AddBomItemManualRequiredQty1792200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "manualRequiredQty" decimal`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "manualRequiredQtyNote" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "manualRequiredQtyAt" timestamp`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQtyAt"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQtyNote"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "manualRequiredQty"`);
    }
}
