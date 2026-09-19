import * as sqlite3 from 'sqlite3';
import { AddBomIsActive1789795000000, SEED_ACTIVE_BOM_SQL } from '../../migrations/1789795000000-AddBomIsActive';
import { pickActiveBom } from './active-bom.util';

// PR-121: 실제 마이그레이션 클래스(up/down)를 인메모리 SQLite에서 그대로 실행해, 시드가 "지금까지의 실제
// 동작(스타일별 가장 큰 id = 최신)"과 똑같은 결과를 내는지 검증한다. (운영은 PostgreSQL이지만 이 SQL은
// 두 DB에서 같은 의미다.)
describe('마이그레이션 AddBomIsActive — 시드가 기존 "최고 id" 규칙을 보존한다 (PR-121)', () => {
  let db: sqlite3.Database;
  const run = (sql: string, params: any[] = []) =>
    new Promise<void>((res, rej) => db.run(sql, params, (e) => (e ? rej(e) : res())));
  const all = <T = any>(sql: string) =>
    new Promise<T[]>((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows as T[]))));
  const queryRunner = { query: (sql: string) => run(sql) } as any;

  // 스타일: A(1건) / B(2건: id 2,3) / C(4건: id 4,5,6,7, 중간에 다른 스타일 끼어듦) / null(스타일 없음 2건)
  const fixtures: [number, string | null][] = [
    [1, 'A'], [2, 'B'], [3, 'B'], [4, 'C'], [5, 'C'], [6, 'B2'], [7, 'C'], [8, 'C'], [9, null], [10, null],
  ];

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await run(`CREATE TABLE "bom_master" ("id" INTEGER PRIMARY KEY, "bomNo" TEXT, "version" TEXT, "styleStyleNo" TEXT)`);
    for (const [id, style] of fixtures) await run(`INSERT INTO "bom_master" VALUES (?, 'BOM', 'V1', ?)`, [id, style]);
  });
  afterEach(() => new Promise<void>((res) => db.close(() => res())));

  it('up: 스타일별로 가장 큰 id만 활성, 나머지 중복은 비활성', async () => {
    await new AddBomIsActive1789795000000().up(queryRunner);
    const rows = await all<{ id: number; styleStyleNo: string | null; isActive: number }>(`SELECT * FROM "bom_master" ORDER BY id`);
    const activeIds = rows.filter((r) => r.isActive).map((r) => r.id);
    expect(activeIds).toEqual([1, 3, 6, 8, 9, 10]); // A=1, B=3, B2=6, C=8, 스타일 없는 BOM(9,10)은 손대지 않음
    expect(rows.find((r) => r.id === 2)!.isActive).toBeFalsy();
    expect(rows.find((r) => r.id === 7)!.isActive).toBeFalsy();
  });

  it('시드 결과로 pickActiveBom이 고르는 BOM은, 이전 규칙(스타일별 최고 id)이 고르던 것과 모든 스타일에서 같다', async () => {
    const before = await all<{ id: number; styleStyleNo: string | null }>(`SELECT id, "styleStyleNo" FROM "bom_master"`);
    const oldRule = new Map<string, number>();
    for (const r of before) if (r.styleStyleNo) oldRule.set(r.styleStyleNo, Math.max(oldRule.get(r.styleStyleNo) ?? 0, r.id));

    await new AddBomIsActive1789795000000().up(queryRunner);
    const after = await all<{ id: number; styleStyleNo: string | null; isActive: number }>(`SELECT * FROM "bom_master"`);
    const byStyle = new Map<string, { id: number; isActive: boolean }[]>();
    for (const r of after) if (r.styleStyleNo) byStyle.set(r.styleStyleNo, [...(byStyle.get(r.styleStyleNo) ?? []), { id: r.id, isActive: !!r.isActive }]);

    expect(byStyle.size).toBe(oldRule.size);
    for (const [styleNo, boms] of byStyle) {
      expect(pickActiveBom(boms)!.id).toBe(oldRule.get(styleNo));
      expect(boms.filter((b) => b.isActive)).toHaveLength(1); // 스타일마다 활성은 정확히 1건
    }
  });

  it('시드 SQL은 여러 번 실행해도(멱등) 같은 결과', async () => {
    const m = new AddBomIsActive1789795000000();
    await m.up(queryRunner);
    await run(SEED_ACTIVE_BOM_SQL);
    const rows = await all<{ id: number; isActive: number }>(`SELECT id, "isActive" FROM "bom_master" WHERE "isActive" = 1 ORDER BY id`);
    expect(rows.map((r) => r.id)).toEqual([1, 3, 6, 8, 9, 10]);
  });

  it('down: 컬럼을 제거한다(되돌리기 가능)', async () => {
    const m = new AddBomIsActive1789795000000();
    await m.up(queryRunner);
    await m.down(queryRunner);
    const cols = await all<{ name: string }>(`PRAGMA table_info("bom_master")`);
    expect(cols.map((c) => c.name)).not.toContain('isActive');
  });

  it('마이그레이션 이후 새로 생기는 BOM은 기본값 활성(true)', async () => {
    await new AddBomIsActive1789795000000().up(queryRunner);
    await run(`INSERT INTO "bom_master" ("id", "bomNo", "version", "styleStyleNo") VALUES (11, 'BOM', 'V1', 'NEW')`);
    const [row] = await all<{ isActive: number }>(`SELECT "isActive" FROM "bom_master" WHERE id = 11`);
    expect(row.isActive).toBeTruthy();
  });
});
