import { MigrationInterface, QueryRunner } from "typeorm";

// PR-166: SALES CONTRACT 통합본 업로드 원본을 저장해 CMT매입단가 표준가격 조회의
// 근거로 쓴다. 데이터는 마이그레이션에 하드코딩하지 않는다(실제 업체 단가 — 민감
// 정보이자 시즌마다 바뀌는 값) — POST /sales-contract-prices/import로 올린다.
export class CreateSalesContractPriceRows1790640000000 implements MigrationInterface {
    name = 'CreateSalesContractPriceRows1790640000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "sales_contract_price_rows" (
                "id" SERIAL NOT NULL,
                "styleNo" character varying NOT NULL,
                "brand" character varying,
                "category" character varying,
                "quantity" decimal,
                "unit" character varying NOT NULL,
                "unitPrice" decimal NOT NULL,
                "amount" decimal,
                "sourceFile" character varying,
                "importBatch" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_sales_contract_price_rows" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_sales_contract_price_rows_styleNo" ON "sales_contract_price_rows" ("styleNo")`);
        await queryRunner.query(`CREATE INDEX "IDX_sales_contract_price_rows_brand_category" ON "sales_contract_price_rows" ("brand", "category")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "sales_contract_price_rows"`);
    }

}
