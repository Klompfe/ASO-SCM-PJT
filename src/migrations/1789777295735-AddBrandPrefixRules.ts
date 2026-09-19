import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBrandPrefixRules1789777295735 implements MigrationInterface {
    name = 'AddBrandPrefixRules1789777295735'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "brand_prefix_rules" ("id" SERIAL NOT NULL, "prefix" character varying, "isNumericStart" boolean NOT NULL DEFAULT false, "brandName" character varying NOT NULL, "note" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fb95269d05145b095680b7435ba" PRIMARY KEY ("id"))`);

        // PR-111: 사용자 확인 + 실제 파일(TYVN2026-21/22/27) 분석으로 확인된 접두사 규칙 시드.
        await queryRunner.query(`INSERT INTO "brand_prefix_rules" ("prefix", "isNumericStart", "brandName", "note") VALUES
            ('BF', false, '빈폴', NULL),
            (NULL, true, '에잇세컨즈', NULL),
            ('MB', false, '미센스', NULL),
            ('LB', false, '루미에반', NULL),
            ('VB', false, '반에크', NULL),
            ('PT', false, 'W컨셉', NULL),
            ('DR', false, 'W컨셉', NULL),
            ('SK', false, 'W컨셉', 'PT/DR과 같은 W컨셉 계열이지만 접두사가 다름'),
            ('MK', false, '킴마틴', '샘플 파일엔 실사례 없음, 사용자 설명 기준으로 등록'),
            ('KM', false, '킴마틴', '샘플 파일엔 실사례 없음, 사용자 설명 기준으로 등록')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "brand_prefix_rules"`);
    }

}
