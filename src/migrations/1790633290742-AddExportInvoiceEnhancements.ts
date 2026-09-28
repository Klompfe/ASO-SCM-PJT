import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExportInvoiceEnhancements1790633290742 implements MigrationInterface {
    name = 'AddExportInvoiceEnhancements1790633290742'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "packing_receipt_rolls" ADD "lengthYd" numeric`);
        await queryRunner.query(`ALTER TABLE "packing_receipts" ADD "cbm" numeric`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "threadType" character varying`);
        await queryRunner.query(`ALTER TABLE "export_shipments" ADD "exchangeRateUsdKrw" numeric`);
        await queryRunner.query(`ALTER TABLE "export_shipments" ADD "exchangeRateDate" date`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "color" character varying`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "cbm" numeric`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "unitPriceUsd" numeric`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "amountUsd" numeric`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD "priceSource" character varying`);

        await queryRunner.query(`CREATE TABLE "mido_price_items" ("id" SERIAL NOT NULL, "itemName" character varying NOT NULL, "priceUsdMin" numeric NOT NULL, "priceUsdMax" numeric NOT NULL, "unit" character varying NOT NULL, "note" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_mido_price_items" PRIMARY KEY ("id"))`);

        // PR-157: 미도.단가표.pdf에서 실제로 값이 확인된 4개 항목만 시드한다. 나머지
        // 22개 항목(배색/안감/심지 등 카테고리 이름만 지시서에 나열되고 실제 USD
        // 단가는 첨부 CSV(미도-단가표-transcribed.csv)로 전달 예정이었으나 이 파일을
        // 로컬에서 찾지 못했다 — 값을 추측해서 채우지 않고 비워둔다(완료 보고에서
        // 파일을 다시 요청).
        await queryRunner.query(`
            INSERT INTO "mido_price_items" ("itemName", "priceUsdMin", "priceUsdMax", "unit", "note") VALUES
            ('겉감(WOOL 60~70%)', 2.5, 3, 'EA', '범위값 — 화면에서 직접 선택'),
            ('겉감(폴리에스터 57"/58" 혼방)', 0.03, 0.07, 'EA', '범위값 — 화면에서 직접 선택'),
            ('심지(INTERLINING) 58"/60"', 0.07, 0.07, 'M', '2026-09-28 사용자 재확인'),
            ('실(THREAD)', 0.00012, 0.00012, 'M', '2026-09-28 사용자 재확인 — 콘 단위 환산은 실 종류별 콘길이를 곱해서 계산(코아사 2500M/오바사·스쿠이사 4000M/폴리지누이도 500M)')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "mido_price_items"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "priceSource"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "amountUsd"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "unitPriceUsd"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "cbm"`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" DROP COLUMN "color"`);
        await queryRunner.query(`ALTER TABLE "export_shipments" DROP COLUMN "exchangeRateDate"`);
        await queryRunner.query(`ALTER TABLE "export_shipments" DROP COLUMN "exchangeRateUsdKrw"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "threadType"`);
        await queryRunner.query(`ALTER TABLE "packing_receipts" DROP COLUMN "cbm"`);
        await queryRunner.query(`ALTER TABLE "packing_receipt_rolls" DROP COLUMN "lengthYd"`);
    }

}
