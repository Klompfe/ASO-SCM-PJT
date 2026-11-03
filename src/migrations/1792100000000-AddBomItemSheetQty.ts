import { MigrationInterface, QueryRunner } from "typeorm";

// PR-220: 작업지시서(작지)에 인쇄된 BOM 행별 수량("출고량")을 발주수량 계산의 기준으로
// 쓰기 위한 컬럼. 기존 bom_item_details.requiredQty는 엑셀(MATERIAL LIST) 경로에서는
// consumption × totalQty로 "계산된 스냅샷"이고, AI(작지) 경로에서는 AI가 그대로 읽은
// 값이 섞여 들어가는 같은 컬럼이라 — 계산 로직이 신뢰해도 되는 값인지 구분할 수 없다.
// sheetQty/sheetQtyUnit은 AI 경로에서만, 사람이 확인 가능한 원문 수치·단위를 별도로
// 저장해(기존 requiredQty는 그대로 둠, 의미 변경 없음) 계산 단계가 "이 값은 작지에서
// 읽은 값"임을 안전하게 식별할 수 있게 한다. nullable — 기존 행은 전부 NULL.
export class AddBomItemSheetQty1792100000000 implements MigrationInterface {
    name = 'AddBomItemSheetQty1792100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "sheetQty" decimal`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "sheetQtyUnit" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "sheetQtyUnit"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "sheetQty"`);
    }
}
