import { MigrationInterface, QueryRunner } from "typeorm";

// PR-184: 관세청 주간환율(수출/수입) 수동 입력 테이블 + 수출선적서류 환율 출처 추적 컬럼.
// 안전 규칙: 기존 테이블/컬럼/데이터는 건드리지 않는다(export_shipments에 nullable 컬럼
// 1개만 추가). 새 테이블(customs_exchange_rates)만 추가한다. 시드 데이터 없음(실제 환율은
// 담당자가 화면에서 입력). 모든 DDL은 IF NOT EXISTS / 존재 검사로 작성해 반복 실행해도 안전하다.
// 번호는 1791600000000(PR-183=1791500000000, 아직 main 미병합 — 이 PR은 그 내용에
// 의존하지 않고 번호만 이어서 쓴다. 이 브랜치는 origin/main에서 분기).
export class AddCustomsExchangeRates1791600000000 implements MigrationInterface {
    name = 'AddCustomsExchangeRates1791600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "customs_exchange_rates" (
                "id" SERIAL NOT NULL,
                "rateType" character varying NOT NULL,
                "currency" character varying NOT NULL DEFAULT 'USD',
                "validFrom" date NOT NULL,
                "validTo" date NOT NULL,
                "rate" numeric(12,4) NOT NULL,
                "note" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_customs_exchange_rates" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_customs_exchange_rates_type_currency_from" UNIQUE ("rateType", "currency", "validFrom")
            )
        `);

        // 수출선적서류에 저장된 환율이 그 주의 수출/수입 주간환율 중 어느 것과 같은지(또는
        // 수동 입력인지) 서버가 스스로 판정해 저장하는 추적용 컬럼. 기존 행은 null("출처
        // 미기록")로 남고 소급 계산하지 않는다.
        await queryRunner.query(`ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "exchangeRateSource" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "export_shipments" DROP COLUMN IF EXISTS "exchangeRateSource"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "customs_exchange_rates"`);
    }
}
