import { MigrationInterface, QueryRunner } from "typeorm";

// PR-167: 바이어별 계약방식(CMT/FOB) 표준화.
// - style_overview/contract에 salesMarket(DOMESTIC/CHINA, nullable) 추가 — 빈폴/
//   에잇세컨즈만 의미 있고, 계약 승인 시점에 담당 관리자가 직접 지정한다(자동 추론 금지).
// - buyers에 defaultProductionType(FOB/CMT, nullable) 추가 — 미도=CMT, W컨셉/
//   킴마틴=FOB, 뮤트=CMT를 이름 매칭으로 시드한다.
//
// 중요: 이 마이그레이션 작성 시점에 실제 Neon buyers 테이블은 0건이다(직접 조회로
// 확인). 즉 아래 UPDATE 문은 지금은 0행에 적용되고 아무 효과가 없다 — 나중에
// 이름이 매칭되는 Buyer가 생기면 그때는 이미 이 마이그레이션이 실행된 뒤라
// 다시 자동 적용되지 않는다. 실제로 미도/W컨셉/킴마틴/뮤트 Buyer를 등록할 때는
// 등록 화면(BuyersManager.tsx)에서 "기본 계약방식"을 직접 선택해야 한다 — 이
// UPDATE는 과거에 이미 등록돼 있었을 경우를 대비한 안전장치일 뿐이다.
export class AddSalesMarketAndBuyerDefaultProductionType1790650000000 implements MigrationInterface {
    name = 'AddSalesMarketAndBuyerDefaultProductionType1790650000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "style_overview" ADD "salesMarket" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "salesMarket" character varying`);
        await queryRunner.query(`ALTER TABLE "buyers" ADD "defaultProductionType" character varying`);

        await queryRunner.query(`UPDATE "buyers" SET "defaultProductionType" = 'CMT' WHERE "name" ILIKE '%미도%'`);
        await queryRunner.query(`UPDATE "buyers" SET "defaultProductionType" = 'FOB' WHERE "name" ILIKE '%더블유컨셉%' OR "name" ILIKE '%W컨셉%' OR "name" ILIKE '%WCONCEPT%'`);
        await queryRunner.query(`UPDATE "buyers" SET "defaultProductionType" = 'FOB' WHERE "name" ILIKE '%킴마틴%'`);
        await queryRunner.query(`UPDATE "buyers" SET "defaultProductionType" = 'CMT' WHERE "name" ILIKE '%뮤트%' OR "name" ILIKE '%MUTE%'`);
        // 빈폴/에잇세컨즈는 의도적으로 세팅하지 않는다(판매시장에 따라 갈려 null로 둠).
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "buyers" DROP COLUMN "defaultProductionType"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "salesMarket"`);
        await queryRunner.query(`ALTER TABLE "style_overview" DROP COLUMN "salesMarket"`);
    }

}
