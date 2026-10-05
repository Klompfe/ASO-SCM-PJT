import { MigrationInterface, QueryRunner } from "typeorm";

// PR-180: 발주 구분(실발주 FIRM / 가발주 PROVISIONAL) 컬럼 추가 + 기존 발주 백필.
//
// 발주(purchase_order)에는 스타일 연결이 없어서, 발주의 품목을 쓰는 "활성 BOM"의 스타일 계약방식
// (style_overview.productionType)으로 정한다. 규칙은 purchase-order-type.util.ts의 suggestOrderType과 같다:
//   - 스타일이 하나도 없음 → null (판단 불가, 로그에 남김)
//   - 계약방식이 없는 스타일이 섞임 → null
//   - FOB와 CMT가 섞임 → null
//   - 전부 FOB → FIRM, 전부 CMT → PROVISIONAL
// 마이그레이션은 util을 import하지 않고 규칙을 복사해 둔다(마이그레이션은 앱 코드 변경과 독립적으로 재현돼야 하므로).
// 백필 결과(구분별 건수, 판단 불가 건)는 실행 로그로 남겨 사람이 검토할 수 있게 한다.
export class AddPurchaseOrderOrderType1791300000000 implements MigrationInterface {
    name = 'AddPurchaseOrderOrderType1791300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" ADD "orderType" character varying`);

        // 자재(item)별로 그 자재를 쓰는 활성 BOM 스타일과 계약방식을 모은다.
        const links: { itemId: number; styleNo: string; productionType: string | null }[] = await queryRunner.query(`
            SELECT bi."materialId" AS "itemId", b."styleStyleNo" AS "styleNo", ov."productionType" AS "productionType"
            FROM "bom_item_details" bi
            JOIN "bom_master" b ON b."id" = bi."bomId"
            LEFT JOIN "master_style" ms ON ms."styleNo" = b."styleStyleNo"
            LEFT JOIN "style_overview" ov ON ov."id" = ms."overviewId"
            WHERE b."isActive" = true AND bi."materialId" IS NOT NULL
        `);
        const typesByItem = new Map<number, Map<string, string | null>>();
        for (const l of links) {
            const byStyle = typesByItem.get(Number(l.itemId)) ?? new Map<string, string | null>();
            byStyle.set(l.styleNo, l.productionType ?? null);
            typesByItem.set(Number(l.itemId), byStyle);
        }

        const pos: { itemId: number }[] = await queryRunner.query(`SELECT DISTINCT "itemId" FROM "purchase_order"`);
        const counts = { FIRM: 0, PROVISIONAL: 0, NO_STYLE: 0, NO_TYPE: 0, MIXED: 0 };
        const undecidedItems: number[] = [];

        for (const { itemId } of pos) {
            const byStyle = typesByItem.get(Number(itemId));
            const poCount: { c: string }[] = await queryRunner.query(
                `SELECT COUNT(*) AS "c" FROM "purchase_order" WHERE "itemId" = $1`,
                [itemId],
            );
            const n = Number(poCount[0].c);

            if (!byStyle || byStyle.size === 0) {
                counts.NO_STYLE += n;
                undecidedItems.push(Number(itemId));
                continue;
            }
            const types = [...byStyle.values()];
            if (types.some((t) => !t)) {
                counts.NO_TYPE += n;
                undecidedItems.push(Number(itemId));
                continue;
            }
            const distinct = new Set(types);
            if (distinct.size > 1) {
                counts.MIXED += n;
                undecidedItems.push(Number(itemId));
                continue;
            }
            const orderType = distinct.has('FOB') ? 'FIRM' : 'PROVISIONAL';
            await queryRunner.query(
                `UPDATE "purchase_order" SET "orderType" = $1 WHERE "itemId" = $2 AND "orderType" IS NULL`,
                [orderType, itemId],
            );
            counts[orderType] += n;
        }

        console.log(
            `[PR-180 발주 구분 백필] FIRM(실발주) ${counts.FIRM}건 / PROVISIONAL(가발주) ${counts.PROVISIONAL}건 / ` +
            `판단 불가: 스타일 없음 ${counts.NO_STYLE}건, 계약방식 없음 ${counts.NO_TYPE}건, FOB·CMT 혼재 ${counts.MIXED}건`,
        );
        if (undecidedItems.length) {
            console.log(`[PR-180 발주 구분 백필] 판단 불가 품목 ID: [${undecidedItems.join(', ')}] — 발주 화면에서 직접 지정하세요.`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_order" DROP COLUMN "orderType"`);
    }
}
