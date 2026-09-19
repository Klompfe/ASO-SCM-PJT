import { MigrationInterface, QueryRunner } from "typeorm";

// PR-121: 스타일별로 현재 "가장 높은 id" BOM만 활성으로 남기고 나머지 중복 BOM은 비활성으로 채운다.
// 이 규칙은 지금까지 코드(재고 차감, BOM 소요명세서 등)가 실제로 쓰던 "최신 = 가장 큰 id"와 정확히 같아서,
// 사용자가 검토·변경하기 전까지는 어떤 결과도 바뀌지 않는다. 스타일이 없는(NULL) BOM은 어떤 조회에도 걸리지
// 않으므로 건드리지 않는다. 테스트가 같은 SQL로 규칙 동일성을 검증할 수 있게 상수로 내보낸다.
export const SEED_ACTIVE_BOM_SQL = `UPDATE "bom_master" SET "isActive" = false
    WHERE "styleStyleNo" IS NOT NULL
      AND "id" NOT IN (SELECT MAX("id") FROM "bom_master" WHERE "styleStyleNo" IS NOT NULL GROUP BY "styleStyleNo")`;

export class AddBomIsActive1789795000000 implements MigrationInterface {
    name = 'AddBomIsActive1789795000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_master" ADD "isActive" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(SEED_ACTIVE_BOM_SQL);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_master" DROP COLUMN "isActive"`);
    }

}
