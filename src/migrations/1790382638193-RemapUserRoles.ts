import { MigrationInterface, QueryRunner } from 'typeorm';

// PR-153: RBAC를 4단계(MASTER/ADMIN/ACCOUNTING/STAFF)로 재설계하면서 기존에 저장된
// role 문자열 값(ADMIN/MANAGER/USER — role 컬럼은 varchar라 DB 레벨 enum 제약은 없지만
// 값 자체는 바꿔줘야 새 코드가 인식한다)을 새 값으로 매핑한다.
//   ADMIN(최상위)   -> MASTER
//   MANAGER(섹션 승인) -> ADMIN   (이름이 재사용되므로 순서/충돌 주의)
//   USER(기본값)    -> STAFF
// ADMIN->MASTER와 MANAGER->ADMIN을 한 번에 하면 "새로 MASTER가 된 행"이 다시
// "MANAGER->ADMIN" 규칙에 걸려 ADMIN으로 덮어써지는 충돌이 생긴다 — role || '_PR153TMP'로
// 전부 임시값을 거친 뒤 최종 매핑하는 2단계 방식으로 피한다.
// 이 branch(feat/rbac-audit-billing-tenant-scaffold)는 아직 origin/main에 merge된 적이
// 없어 production에는 이 UPDATE들이 실제로 적용할 대상 행이 있을 뿐(PR-151의 OPERATOR/
// VIEWER 관련 마이그레이션은 애초에 만들어진 적이 없어 별도 정리 불필요 — 확인 완료).
export class RemapUserRoles1790382638193 implements MigrationInterface {
  name = 'RemapUserRoles1790382638193';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "role" = "role" || '_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'MASTER' WHERE "role" = 'ADMIN_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'ADMIN' WHERE "role" = 'MANAGER_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'STAFF' WHERE "role" = 'USER_PR153TMP'`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'`);
    await queryRunner.query(`UPDATE "users" SET "role" = "role" || '_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'ADMIN' WHERE "role" = 'MASTER_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'MANAGER' WHERE "role" = 'ADMIN_PR153TMP'`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'USER' WHERE "role" = 'STAFF_PR153TMP'`);
    // ACCOUNTING은 새로 생긴 값이라 되돌릴 대응 값이 없다 — 원래 값을 알 수 없으므로
    // 안전하게 기본값이었던 USER로 되돌린다(down은 비상시 롤백용이라 완벽한 역변환을
    // 보장하진 않음, 이 판단은 되돌릴 일이 실제로 생기면 그때 재검토).
    await queryRunner.query(`UPDATE "users" SET "role" = 'USER' WHERE "role" = 'ACCOUNTING_PR153TMP'`);
  }
}
