import { MigrationInterface, QueryRunner } from "typeorm";

// PR-175: 실/테이프 포장단위 표준화.
// - 하드코딩 상수(thread-cone-price.util.ts의 THREAD_CONE_LENGTH_M, PR-157)를
//   DB 테이블(material_packaging_unit_rules)로 옮긴다 — brand_prefix_rules와 동일한
//   "늘거나 바뀔 수 있는 규칙은 하드코딩하지 않는다" 설계 원칙.
// - 신규 테이프(다데/암홀) 서브타입을 bom_item_details.tapeType 컬럼으로 추가한다
//   (기존 threadType과 동일한 구조 — nullable varchar, enum 값은 애플리케이션 레벨에서 검증).
// - 시드 데이터: 코아사=2500m/콘, 오바사=4000m/콘, 지누이도사=500m/콘(기존 상수와 동일,
//   사용자 재확인됨), 다데=50m/롤, 암홀=50m/롤(신규).
export class AddMaterialPackagingUnitRulesAndTapeType1791100000000 implements MigrationInterface {
    name = 'AddMaterialPackagingUnitRulesAndTapeType1791100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "material_packaging_unit_rules" (
                "id" SERIAL NOT NULL,
                "materialSubType" character varying NOT NULL,
                "displayName" character varying NOT NULL,
                "packagingUnitLabel" character varying NOT NULL,
                "unitLengthM" decimal NOT NULL,
                "note" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_material_packaging_unit_rules" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_material_packaging_unit_rules_subtype" UNIQUE ("materialSubType")
            )
        `);

        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD "tapeType" character varying`);

        await queryRunner.query(`
            INSERT INTO "material_packaging_unit_rules" ("materialSubType", "displayName", "packagingUnitLabel", "unitLengthM", "note") VALUES
            ('COA_SA', '코아사', '콘', 2500, '사용자 확인 자료 기준(PR-157에서 이미 하드코딩됐던 값, 재확인됨)'),
            ('OBA_SA_SKU_I_SA', '오바사·스쿠이사', '콘', 4000, '사용자 확인 자료 기준(PR-157에서 이미 하드코딩됐던 값, 재확인됨)'),
            ('POLY_JINUIDO', '폴리지누이도', '콘', 500, '사용자 확인 자료 기준(PR-157에서 이미 하드코딩됐던 값, 재확인됨)'),
            ('DADE', '다데', '롤', 50, 'PR-175 신규 — 테이프류'),
            ('AMHOL', '암홀', '롤', 50, 'PR-175 신규 — 테이프류')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN "tapeType"`);
        await queryRunner.query(`DROP TABLE "material_packaging_unit_rules"`);
    }

}
