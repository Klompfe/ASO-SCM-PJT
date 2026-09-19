import { MigrationInterface, QueryRunner } from "typeorm";
import { findMergePairsForStyle, mergeDuplicateItems } from "../items/utils/item-merge.util";

// PR-123: MB6YSLM115Z의 BOM #1이 참조하던 자재 마스터(Item)는 활성 BOM(#88)이 참조하는 Item과 이름이 줄바꿈/공백 표기만
// 다른 별도 레코드였다. 활성 BOM이 참조하는 Item을 정답으로 삼아, 다른 BOM들이 참조하는 중복 Item을 정규화한 이름으로
// 짝지어 흡수한다. 실행 순서/안전장치(참조 이동 → 참조 0건 확인 → Item 삭제)는 mergeDuplicateItems에 있다.
// 이미 병합된 DB(또는 해당 스타일이 없는 개발 DB)에서는 짝이 0건이라 아무것도 하지 않는다(멱등).
// 병합은 되돌리지 않는다 — 어떤 Item이 어디로 합쳐졌는지는 아래 로그(대응표)로만 남긴다.
export class MergeMb6yslm115zDuplicateItems1789800000000 implements MigrationInterface {
    name = 'MergeMb6yslm115zDuplicateItems1789800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const exec = { query: (sql: string) => queryRunner.query(sql) };
        const styleNo = 'MB6YSLM115Z';

        const { pairs, unmatched, activeBomId, sourceBomIds } = await findMergePairsForStyle(exec, styleNo);
        console.log(`[PR-123] ${styleNo}: 활성 BOM #${activeBomId ?? '-'} 기준, 비교 대상 BOM ${JSON.stringify(sourceBomIds)}`);
        if (unmatched.length > 0) {
            console.log(`[PR-123] 짝을 찾지 못하거나 모호해 병합하지 않는 Item ${unmatched.length}개: ${JSON.stringify(unmatched)}`);
        }
        if (pairs.length === 0) {
            console.log('[PR-123] 병합할 중복 Item이 없습니다(이미 정리됨).');
            return;
        }

        console.log(`[PR-123] 병합 대응표(중복 Item id → 정답 Item id) ${pairs.length}쌍:`);
        for (const p of pairs) console.log(`[PR-123]   ${p.duplicateId} -> ${p.canonicalId}  ${JSON.stringify(p.name)}`);

        const report = await mergeDuplicateItems(exec, pairs);
        console.log(`[PR-123] 리포인트한 행 수: ${JSON.stringify(report.repointed)}`);
        console.log(`[PR-123] Inventory: 옮긴 행 ${report.inventory.rowsRepointed}건, 정답 행에 합산 후 삭제한 행 ${report.inventory.rowsDeleted}건 ${JSON.stringify(report.inventory.ops)}`);
        console.log(`[PR-123] 삭제한 중복 Item: ${report.deletedItems}개`);
    }

    public async down(): Promise<void> {
        // 되돌리지 않는다: 삭제된 중복 Item은 이름 표기(줄바꿈)만 다른 같은 자재였고, 대응표는 up 로그에 남아 있다.
    }

}
