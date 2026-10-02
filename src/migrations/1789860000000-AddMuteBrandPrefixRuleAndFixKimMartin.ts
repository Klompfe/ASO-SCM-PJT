import { MigrationInterface, QueryRunner } from "typeorm";

// PR-165: PR-111 시드 당시 "샘플 파일엔 실사례 없음, 사용자 설명 기준으로 등록"이라고
// 명시했던 MK/KM을 둘 다 "킴마틴"으로 잘못 추정했었다 — 사용자가 이번에 MK=마뗑킴,
// KM=킴마틴으로 분리해 확정했다. 또한 실제 26FW_통합_SALES_CONTRACT 파일(스타일번호
// 110건) 분석으로 뮤트(MUTE) 브랜드의 숫자시작 패턴(연도2자리+시즌1자리(F/S)+품목코드,
// 예: 26FOT08)이 검증되어 신규 등록한다. 숫자시작 규칙이 둘 이상 생기므로
// numericPattern 컬럼을 추가해 "더 구체적인 패턴을 가진 규칙을 먼저 검사"하는
// classifyBrand()의 새 로직이 데이터로 구분되게 한다(하드코딩 아님).
export class AddMuteBrandPrefixRuleAndFixKimMartin1789860000000 implements MigrationInterface {
    name = 'AddMuteBrandPrefixRuleAndFixKimMartin1789860000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" ADD "numericPattern" character varying`);

        await queryRunner.query(`
            UPDATE "brand_prefix_rules"
            SET "brandName" = '마뗑킴',
                "note" = '2026-10-02 정정: 실사례 없이 추정 입력됐던 값을 사용자 확인으로 정정(기존 "킴마틴"은 KM의 브랜드명이었음)'
            WHERE "prefix" = 'MK' AND "isNumericStart" = false
        `);

        await queryRunner.query(`
            UPDATE "brand_prefix_rules"
            SET "note" = '2026-10-02 사용자 재확인'
            WHERE "prefix" = 'KM' AND "isNumericStart" = false
        `);

        await queryRunner.query(`
            INSERT INTO "brand_prefix_rules" ("prefix", "isNumericStart", "numericPattern", "brandName", "note")
            VALUES (NULL, true, '^\\d{2}[FS]', '뮤트', '연도2자리+시즌1자리(F/S)+품목코드(OT/BT), 예: 26FOT08 — 26FW_통합_SALES_CONTRACT 실데이터(110건)로 검증')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "brand_prefix_rules" WHERE "brandName" = '뮤트' AND "isNumericStart" = true`);

        await queryRunner.query(`
            UPDATE "brand_prefix_rules"
            SET "brandName" = '킴마틴',
                "note" = '샘플 파일엔 실사례 없음, 사용자 설명 기준으로 등록'
            WHERE "prefix" = 'MK' AND "isNumericStart" = false
        `);

        await queryRunner.query(`
            UPDATE "brand_prefix_rules"
            SET "note" = '샘플 파일엔 실사례 없음, 사용자 설명 기준으로 등록'
            WHERE "prefix" = 'KM' AND "isNumericStart" = false
        `);

        await queryRunner.query(`ALTER TABLE "brand_prefix_rules" DROP COLUMN "numericPattern"`);
    }

}
