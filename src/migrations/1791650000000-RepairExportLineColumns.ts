import { MigrationInterface, QueryRunner } from "typeorm";

// FIX-1: 운영 DB 스키마 유실 복구. migrations 테이블에는
// AddExportLineMaterialSubTypeAndPriceBasisNote1791400000000(PR-182)이 "적용됨"으로
// 기록돼 있었는데, 실제 export_shipment_lines에는 materialSubType/priceBasisNote
// 컬럼이 없었다(GET /export-shipments가 500을 반환). 원인 추정: .env가 운영 DB를
// 가리킨 상태에서 NODE_ENV=production 없이 서버/스크립트를 실행하면
// TypeORM synchronize가 그 실행 당시 엔티티에 없는 컬럼을 운영 DB에서 삭제한다
// (purchase_order.orderType이 같은 방식으로 유실돼 복구된 전례가 있음, 4단계에서
// 재발 방지 조치).
//
// 이 마이그레이션은 "복구 마이그레이션"이다 — 이미 복구된 DB(이번 FIX-1에서 직접
// ALTER TABLE로 되살린 운영 DB 포함)에서 다시 실행해도 안전하게 no-op이도록
// IF NOT EXISTS만 쓴다. down()은 일부러 비워 둔다(복구를 되돌리면 안 됨).
export class RepairExportLineColumns1791650000000 implements MigrationInterface {
    name = 'RepairExportLineColumns1791650000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD COLUMN IF NOT EXISTS "materialSubType" character varying`);
        await queryRunner.query(`ALTER TABLE "export_shipment_lines" ADD COLUMN IF NOT EXISTS "priceBasisNote" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 의도적으로 비워 둔다 — 이 마이그레이션은 유실된 컬럼을 복구하는 것이므로
        // revert가 다시 컬럼을 지우면 같은 사고를 반복하는 셈이 된다.
    }
}
