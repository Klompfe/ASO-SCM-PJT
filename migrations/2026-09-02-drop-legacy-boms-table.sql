-- 1회성 정리 마이그레이션
-- 대상: 'boms' 테이블 (구 src/items/entities/bom.entity.ts, @Entity('boms')가 생성)
-- 배경: 해당 엔티티 파일은 삭제되었고(git rm), synchronize:true는 사용하지 않는 테이블을
--       자동으로 지워주지 않으므로 남아있던 고아 테이블을 수동으로 제거한다.
-- 전제조건: 실행 전 반드시 `SELECT COUNT(*) FROM boms;` 결과가 0인지 재확인할 것.
--          0이 아니면 이 스크립트를 실행하지 말고 데이터 이관 여부를 먼저 검토한다.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS boms;

PRAGMA foreign_keys = ON;
