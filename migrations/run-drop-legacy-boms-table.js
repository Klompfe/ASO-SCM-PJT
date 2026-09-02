// 1회성 실행 스크립트: migrations/2026-09-02-drop-legacy-boms-table.sql 적용
// 사용법: node migrations/run-drop-legacy-boms-table.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve(__dirname, '..', 'scm_db.sqlite');
const sqlPath = path.resolve(__dirname, '2026-09-02-drop-legacy-boms-table.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

const db = new sqlite3.Database(dbPath);

db.get("SELECT COUNT(*) as cnt FROM boms", (err, row) => {
  if (err) {
    console.error('boms 테이블 조회 실패:', err.message);
    db.close();
    process.exit(1);
  }

  if (row.cnt !== 0) {
    console.error(`중단: boms 테이블에 ${row.cnt}건의 데이터가 있습니다. 데이터 이관을 먼저 검토하세요.`);
    db.close();
    process.exit(1);
  }

  console.log('boms 테이블 row count 재확인: 0건. DROP을 진행합니다.');

  db.exec(sql, (execErr) => {
    if (execErr) {
      console.error('마이그레이션 실행 실패:', execErr.message);
      db.close();
      process.exit(1);
    }

    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='boms'", (checkErr, checkRow) => {
      if (checkErr) {
        console.error(checkErr.message);
        db.close();
        process.exit(1);
      }
      console.log('boms 테이블 제거 확인:', checkRow ? '실패 (여전히 존재)' : '성공 (더 이상 존재하지 않음)');
      db.close();
    });
  });
});
