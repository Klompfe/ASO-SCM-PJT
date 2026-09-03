-- 1회성 정리 마이그레이션
-- 대상 (사용자 확인 완료, 폐기 결정된 고아 테이블만):
--   1) material_lists (35행) - setup.sql이 items에서 1회성 마이그레이션한 데이터,
--      코드베이스 어디에도 매핑되는 엔티티 없음
--   2) bom_items (35행) - 위와 동일한 이유로 고아
--   3) tx_bom (0행) - transaction/entities/transaction.entities.ts에서 Bom 엔티티를
--      제거하면서(chore(transaction) 커밋) 새로 고아가 된 테이블
--
-- 주의: bom(0행), bom_item(0행)은 이번 조사에서 추가로 발견된 별도의 고아 테이블이지만
--       사용자 확인 전이므로 이 마이그레이션에서 절대 건드리지 않는다.
--
-- 전제조건: 실행 전 반드시 각 테이블의 row count를 재확인할 것
--          (material_lists/bom_items = 35, tx_bom = 0이 아니면 중단)

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS material_lists;
DROP TABLE IF EXISTS bom_items;
DROP TABLE IF EXISTS tx_bom;

PRAGMA foreign_keys = ON;
