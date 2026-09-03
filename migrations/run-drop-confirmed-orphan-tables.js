// 1회성 실행 스크립트: migrations/2026-09-03-drop-confirmed-orphan-tables.sql 적용
// 사용법: node migrations/run-drop-confirmed-orphan-tables.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve(__dirname, '..', 'scm_db.sqlite');
const sqlPath = path.resolve(__dirname, '2026-09-03-drop-confirmed-orphan-tables.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

const expected = {
  material_lists: 35,
  bom_items: 35,
  tx_bom: 0,
};

const db = new sqlite3.Database(dbPath);

function checkCounts(callback) {
  const names = Object.keys(expected);
  const actual = {};
  let i = 0;

  function next() {
    if (i >= names.length) return callback(actual);
    const name = names[i++];
    db.get(`SELECT COUNT(*) as cnt FROM ${name}`, (err, row) => {
      if (err) {
        console.error(`${name} 조회 실패:`, err.message);
        db.close();
        process.exit(1);
      }
      actual[name] = row.cnt;
      next();
    });
  }
  next();
}

checkCounts((actual) => {
  console.log('DROP 직전 재확인 row count:');
  let mismatch = false;
  for (const name of Object.keys(expected)) {
    const ok = actual[name] === expected[name];
    console.log(`  ${name}: expected=${expected[name]}, actual=${actual[name]} ${ok ? 'OK' : 'MISMATCH'}`);
    if (!ok) mismatch = true;
  }

  if (mismatch) {
    console.error('중단: 예상 row count와 다릅니다. DROP을 실행하지 않습니다.');
    db.close();
    process.exit(1);
  }

  console.log('모든 테이블 row count 일치. DROP을 진행합니다.');

  db.exec(sql, (execErr) => {
    if (execErr) {
      console.error('마이그레이션 실행 실패:', execErr.message);
      db.close();
      process.exit(1);
    }

    const names = Object.keys(expected);
    let i = 0;
    function verifyNext() {
      if (i >= names.length) {
        db.close();
        return;
      }
      const name = names[i++];
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name], (checkErr, row) => {
        if (checkErr) {
          console.error(checkErr.message);
          db.close();
          process.exit(1);
        }
        console.log(`${name} 제거 확인:`, row ? '실패 (여전히 존재)' : '성공 (더 이상 존재하지 않음)');
        verifyNext();
      });
    }
    verifyNext();
  });
});
