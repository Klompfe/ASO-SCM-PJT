import { MigrationInterface, QueryRunner } from "typeorm";
import { findSystemWideMergePairs, mergeDuplicateItems } from "../items/utils/item-merge.util";

// PR-125: 정규화한 이름이 같은데 id가 다른 자재 마스터(Item)를 시스템 전체에서 하나로 합친다(PR-123에서 MB6YSLM115Z만 처리하고
// 남긴 나머지). 정답은 그룹 안에서 BomItem 참조가 가장 많은 Item(동률이면 id 최소). 실행 엔진과 안전장치(참조 이동 → 참조 0건 재확인 →
// 삭제, 남은 참조가 있으면 중단)는 PR-123의 mergeDuplicateItems를 그대로 쓴다. 다른 테이블(PO/재고/작업지시)이 참조하는 그룹이나
// type이 다른 그룹은 건드리지 않고 건너뛴다. 이미 정리된 DB에서는 짝이 0건이라 아무것도 하지 않는다(멱등).
// 병합은 되돌리지 않는다 — 대응표는 아래 로그로만 남긴다.
export class MergeSystemWideDuplicateItems1789820000000 implements MigrationInterface {
    name = 'MergeSystemWideDuplicateItems1789820000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const exec = { query: (sql: string) => queryRunner.query(sql) };
        const { pairs, groups, skipped, expectedBomRepoints } = await findSystemWideMergePairs(exec);

        console.log(`[PR-125] 병합 대상 그룹 ${groups.length}개, 삭제 예정 Item ${pairs.length}개, 예상 bom_item_details 리포인트 ${expectedBomRepoints}행`);
        if (skipped.length > 0) console.log(`[PR-125] 건너뛴 그룹 ${skipped.length}개: ${JSON.stringify(skipped)}`);
        if (pairs.length === 0) {
            console.log('[PR-125] 병합할 중복 Item이 없습니다(이미 정리됨).');
            return;
        }
        for (const g of groups) {
            console.log(`[PR-125]   정답 ${g.canonicalId} <- 중복 ${JSON.stringify(g.duplicateIds)}  참조 ${JSON.stringify(g.bomRefs)}  ${JSON.stringify(g.name)}`);
        }

        const report = await mergeDuplicateItems(exec, pairs);
        console.log(`[PR-125] 리포인트한 행 수: ${JSON.stringify(report.repointed)}`);
        console.log(`[PR-125] Inventory: 옮긴 행 ${report.inventory.rowsRepointed}건, 합산 후 삭제한 행 ${report.inventory.rowsDeleted}건`);
        console.log(`[PR-125] 삭제한 중복 Item: ${report.deletedItems}개`);
        if (report.repointed.bom_item_details !== expectedBomRepoints) {
            // 예상과 실제가 다르면 그 사이 데이터가 바뀐 것이므로 트랜잭션을 되돌린다.
            throw new Error(`리포인트 행 수가 예상(${expectedBomRepoints})과 다릅니다: ${report.repointed.bom_item_details}`);
        }
    }

    public async down(): Promise<void> {
        // 되돌리지 않는다(같은 자재의 이름 표기만 다른 중복 레코드였고, 대응표는 up 로그에 남아 있다).
    }

}
