const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');
const db = new sqlite3.Database('db.sqlite');

db.serialize(() => {
  db.all("PRAGMA table_info(inventories)", (err, columns) => {
    if (err || !columns.length) {
      console.error('❌ inventories 테이블을 읽을 수 없습니다.');
      return;
    }

    const colNames = columns.map((c) => c.name);
    const itemCol = colNames.includes('item_id')
      ? 'item_id'
      : colNames.includes('itemId')
      ? 'itemId'
      : 'item_id';

    // id(UUID)와 함께 원자재(itemId: 1) 재고 10개 충전
    const id = randomUUID();
    const sql = `INSERT INTO inventories (id, ${itemCol}, quantity) VALUES (?, 1, 10)`;

    db.run(sql, [id], function (insertErr) {
      if (insertErr) {
        console.error('❌ 삽입 오류:', insertErr.message);
      } else {
        console.log(`✅ inventories 테이블에 원자재(itemId: 1) 재고 10개 충전 완료! (ID: ${id})`);
      }
    });
  });
});