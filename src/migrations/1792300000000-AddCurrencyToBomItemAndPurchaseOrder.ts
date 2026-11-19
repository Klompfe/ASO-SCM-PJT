import { MigrationInterface, QueryRunner } from "typeorm";

// PR-244a: 단가 통화 컬럼(BOM 행·발주). additive-only — 컬럼 2개만 추가하고 기존
// 컬럼/데이터는 건드리지 않는다. varchar(3) NULL 허용 + 기본값 'KRW': PostgreSQL 은
// 기본값이 있는 컬럼을 추가할 때 기존 행도 'KRW' 로 읽힌다(코드는 NULL 도 KRW 로 취급).
// 인덱스·CHECK 제약은 두지 않는다(허용 통화 검증은 서버 코드, src/common/constants/currency.ts).
export class AddCurrencyToBomItemAndPurchaseOrder1792300000000 implements MigrationInterface {
    name = 'AddCurrencyToBomItemAndPurchaseOrder1792300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bom_item_details" ADD COLUMN IF NOT EXISTS "currency" character varying(3) DEFAULT 'KRW'`);
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "currency" character varying(3) DEFAULT 'KRW'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN IF EXISTS "currency"`);
        await queryRunner.query(`ALTER TABLE "bom_item_details" DROP COLUMN IF EXISTS "currency"`);
    }
}
