import * as sqlite3 from 'sqlite3';
import { AddBomItemSheetQty1792100000000 } from '../../migrations/1792100000000-AddBomItemSheetQty';

// PR-220: 단순 추가 전용 마이그레이션(컬럼 2개, 데이터 변환 없음)이지만, up/down이 실제로
// 실행 가능한 SQL인지는 실행해서 확인해야 믿을 수 있다 — add-bom-is-active.migration.spec.ts와
// 같은 패턴(인메모리 SQLite에 실제 up/down을 실행)으로 검증한다.
describe('마이그레이션 AddBomItemSheetQty — 추가 전용, nullable, down으로 되돌릴 수 있다 (PR-220)', () => {
  let db: sqlite3.Database;
  const run = (sql: string) => new Promise<void>((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
  const all = <T = any>(sql: string) => new Promise<T[]>((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows as T[]))));
  const queryRunner = { query: (sql: string) => run(sql) } as any;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await run(`CREATE TABLE "bom_item_details" ("id" INTEGER PRIMARY KEY, "consumption" TEXT, "requiredQty" TEXT)`);
    // 기존 행 하나 — 마이그레이션 전/후로 NULL인지 확인.
    await run(`INSERT INTO "bom_item_details" ("id", "consumption", "requiredQty") VALUES (1, '1.5', '100')`);
  });
  afterEach(() => new Promise<void>((res) => db.close(() => res())));

  it('up: sheetQty/sheetQtyUnit 컬럼이 추가되고, 기존 행은 둘 다 NULL이다', async () => {
    await new AddBomItemSheetQty1792100000000().up(queryRunner);
    const cols = await all<{ name: string }>(`PRAGMA table_info("bom_item_details")`);
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['sheetQty', 'sheetQtyUnit']));

    const [row] = await all<{ sheetQty: unknown; sheetQtyUnit: unknown }>(`SELECT "sheetQty", "sheetQtyUnit" FROM "bom_item_details" WHERE id = 1`);
    expect(row.sheetQty).toBeNull();
    expect(row.sheetQtyUnit).toBeNull();
  });

  it('up 이후 새 값을 넣을 수 있다(소수 허용)', async () => {
    await new AddBomItemSheetQty1792100000000().up(queryRunner);
    await run(`UPDATE "bom_item_details" SET "sheetQty" = 758.5, "sheetQtyUnit" = 'Y' WHERE id = 1`);
    const [row] = await all<{ sheetQty: number; sheetQtyUnit: string }>(`SELECT "sheetQty", "sheetQtyUnit" FROM "bom_item_details" WHERE id = 1`);
    expect(row.sheetQty).toBe(758.5);
    expect(row.sheetQtyUnit).toBe('Y');
  });

  it('down: 두 컬럼 모두 제거된다(되돌리기 가능, up과 반대 순서)', async () => {
    const m = new AddBomItemSheetQty1792100000000();
    await m.up(queryRunner);
    await m.down(queryRunner);
    const cols = await all<{ name: string }>(`PRAGMA table_info("bom_item_details")`);
    expect(cols.map((c) => c.name)).not.toContain('sheetQty');
    expect(cols.map((c) => c.name)).not.toContain('sheetQtyUnit');
    // 기존 컬럼(consumption/requiredQty)은 그대로 남아 있다(이 마이그레이션은 추가 전용).
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['id', 'consumption', 'requiredQty']));
  });
});
