import { MigrationInterface, QueryRunner } from "typeorm";

// PR-212: 수량을 스타일 totalQty 한 값이 아니라 색상×사이즈 단위로 저장하는 기반 테이블.
// 추가 전용(기존 테이블/데이터 변경 없음) — up()은 새 테이블 생성 + FK만, down()은 대칭으로
// 테이블 삭제. 타임스탬프(1792000000000)는 main의 현재 최대값(1791800000000)과, 아직
// 병합되지 않은 feat/mido-price-table-admin-r1의 마이그레이션(1791900000000)보다도 크게
// 잡았다(git ls-tree origin/feat/mido-price-table-admin-r1 src/migrations/ 로 확인) — 그
// 브랜치가 먼저 병합되더라도 타임스탬프 순서가 꼬이지 않게.
//
// market 컬럼은 이번 PR에서는 'DOMESTIC'만 쓰지만(중국 수량은 사용자 결정으로 이번에
// 저장하지 않음), 나중에 중국 수량을 지원할 때 마이그레이션 없이 바로 값을 넣을 수 있게
// 미리 열어둔다. FK의 ON DELETE 정책은 다른 styleNo 참조 테이블(contract/order_shipments/
// order_process_stages/bom_master)과 전부 동일하게 NO ACTION으로 맞춘다 — 이 스타일들은
// 스타일 삭제 시 StylesService.remove()가 각 테이블을 애플리케이션 레벨에서 먼저 지우므로
// (styles.service.ts:127~), DB가 CASCADE로 대신 처리하지 않는 것이 기존 관례다.
export class AddStyleColorSizeQuantities1792000000000 implements MigrationInterface {
    name = 'AddStyleColorSizeQuantities1792000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "style_color_size_quantities" (
                "id" SERIAL NOT NULL,
                "styleNo" character varying NOT NULL,
                "color" character varying NOT NULL,
                "size" character varying NOT NULL,
                "market" character varying NOT NULL DEFAULT 'DOMESTIC',
                "qty" integer NOT NULL,
                "source" character varying NOT NULL DEFAULT 'MATERIAL_LIST',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_style_color_size_qty_key" UNIQUE ("styleNo", "color", "size", "market"),
                CONSTRAINT "PK_style_color_size_quantities" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_style_color_size_qty_styleNo" ON "style_color_size_quantities" ("styleNo")`);
        await queryRunner.query(`
            ALTER TABLE "style_color_size_quantities"
            ADD CONSTRAINT "FK_style_color_size_qty_styleNo"
            FOREIGN KEY ("styleNo") REFERENCES "master_style"("styleNo") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "style_color_size_quantities" DROP CONSTRAINT "FK_style_color_size_qty_styleNo"`);
        await queryRunner.query(`DROP TABLE "style_color_size_quantities"`);
    }

}
