import { MigrationInterface, QueryRunner } from "typeorm";

// PR-182: 수출 INVOICE — 실/테이프 단가를 미터단가 → 콘/롤단가로 환산.
// - export_shipment_lines에 materialSubType(라인 생성 시 BomItem.threadType/tapeType을
//   그대로 복사 — 기존 행은 null, 안전모드: 모르는 종류를 추측해서 채우지 않는다)과
//   priceBasisNote(환산 근거 — confirmLinePrice에서 사람이 확정한 식을 그대로 저장)를 추가한다.
// - mido_price_items에 테이프(다데/암홀) 미터단가를 시드한다. 기존에는 실(THREAD)만
//   있었고 테이프 단가는 전혀 없었다(확인 완료) — 제시님이 검증한 값: 다데 $0.0008/M,
//   암홀 $0.01/M(둘 다 50m/롤 기준 콘/롤 환산은 material_packaging_unit_rules에서 조회).
export class AddExportLineMaterialSubTypeAndPriceBasisNote1791400000000 implements MigrationInterface {
    name = 'AddExportLineMaterialSubTypeAndPriceBasisNote1791400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "materialSubType" character varying`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "priceBasisNote" text`);

        // itemName에 "TAPE"(영문 표기 매칭용)와 "다데"/"암홀"(종류별 환산 매칭용, PR-182
        // MidoPriceTableService.buildConversion 참고)을 모두 포함시킨다 — '실(THREAD)'
        // 항목의 기존 명명 관례("한글명(영문명)")를 그대로 따른다.
        await queryRunner.query(`
            INSERT INTO "mido_price_items" ("itemName", "priceUsdMin", "priceUsdMax", "unit", "note") VALUES
            ('테이프(TAPE) 다데', 0.0008, 0.0008, 'M', 'PR-182 — 실제 INVOICE로 검증. 롤 단가 환산은 material_packaging_unit_rules(50m/롤) 참고'),
            ('테이프(TAPE) 암홀', 0.01, 0.01, 'M', 'PR-182 — 실제 INVOICE로 검증. 롤 단가 환산은 material_packaging_unit_rules(50m/롤) 참고')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "mido_price_items" WHERE "itemName" IN ('테이프(TAPE) 다데', '테이프(TAPE) 암홀')`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "priceBasisNote"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "materialSubType"`);
    }
}
