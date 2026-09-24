import * as sqlite3 from 'sqlite3';
import { DefaultNamingStrategy } from 'typeorm';
import { COLUMN_RENAME, RenameWorkOrderToSalesOrderTables1789840000000, TABLE_RENAMES } from '../../migrations/1789840000000-RenameWorkOrderToSalesOrderTables';

// PR-133: 실제 마이그레이션 클래스(up/down)를 인메모리 SQLite에서 그대로 실행해 "이름만 바뀌고 데이터는 그대로"임을 검증한다
// (RENAME 문법은 SQLite/PostgreSQL에서 같다). Postgres 전용 후처리(시퀀스/제약 이름 정렬)는 가짜 Postgres 러너로 발행 SQL을 검증한다.
describe('마이그레이션 RenameWorkOrderToSalesOrderTables — 이름만 바꾸고 데이터는 보존 (PR-133)', () => {
  describe('SQLite에서 실제 실행', () => {
    let db: sqlite3.Database;
    const run = (sql: string, params: any[] = []) => new Promise<void>((res, rej) => db.run(sql, params, (e) => (e ? rej(e) : res())));
    const all = <T = any>(sql: string) => new Promise<T[]>((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows as T[]))));
    const queryRunner = { query: (sql: string) => run(sql) } as any; // connection 정보가 없으므로 Postgres 후처리는 건너뛴다
    const tables = async () => (await all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map((r) => r.name);
    const cols = async (t: string) => (await all<{ name: string }>(`PRAGMA table_info("${t}")`)).map((r) => r.name);

    beforeEach(async () => {
      db = new sqlite3.Database(':memory:');
      await run(`PRAGMA foreign_keys = ON`);
      await run(`CREATE TABLE "work_order_spec" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "styleNo" TEXT NOT NULL, "workNotes" TEXT, "createdAt" TEXT NOT NULL)`);
      await run(`CREATE TABLE "work_order_size_spec_row" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "part" TEXT NOT NULL, "size" TEXT NOT NULL, "specId" INTEGER, FOREIGN KEY ("specId") REFERENCES "work_order_spec"("id"))`);
      await run(`CREATE TABLE "contract" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "styleNo" TEXT NOT NULL, "triggeredByWorkOrderSpecId" INTEGER)`);
      for (const [id, s] of [[1, 'A'], [2, 'B'], [3, 'C']] as const) await run(`INSERT INTO "work_order_spec" VALUES (?, ?, ?, ?)`, [id, s, `노트 ${s}`, `2026-09-0${id}`]);
      for (const [id, part, size, spec] of [[1, '화장', '0', 1], [2, '총기장', '1', 1], [3, '품', '0', 2], [4, '밑단', 'Free', 3], [5, '화장', '2', 3]] as const) {
        await run(`INSERT INTO "work_order_size_spec_row" VALUES (?, ?, ?, ?)`, [id, part, size, spec]);
      }
      for (const [id, s, spec] of [[1, 'A', 1], [2, 'B', 2], [3, 'C', 3], [4, 'MANUAL', null]] as const) await run(`INSERT INTO "contract" VALUES (?, ?, ?)`, [id, s, spec]);
    });
    afterEach(() => new Promise<void>((res) => db.close(() => res())));

    it('up: 테이블/컬럼 이름이 바뀌고 옛 이름은 사라진다', async () => {
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(queryRunner);
      const t = await tables();
      expect(t).toEqual(expect.arrayContaining(['sales_order_spec', 'sales_order_size_spec_row', 'contract']));
      expect(t).not.toContain('work_order_spec');
      expect(t).not.toContain('work_order_size_spec_row');
      const contractCols = await cols('contract');
      expect(contractCols).toContain('triggeredBySalesOrderSpecId');
      expect(contractCols).not.toContain('triggeredByWorkOrderSpecId');
      expect(await cols('sales_order_size_spec_row')).toContain('specId'); // FK 컬럼 이름은 그대로
    });

    it('up: 행 수/ID/값이 하나도 바뀌지 않는다(작업명세 3, 사이즈 행 5, 계약 4 — 계약의 연결 ID 값도 그대로)', async () => {
      const before = {
        specs: await all(`SELECT * FROM "work_order_spec" ORDER BY id`),
        rows: await all(`SELECT * FROM "work_order_size_spec_row" ORDER BY id`),
        links: await all(`SELECT id, "triggeredByWorkOrderSpecId" AS spec FROM "contract" ORDER BY id`),
      };
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(queryRunner);
      const after = {
        specs: await all(`SELECT * FROM "sales_order_spec" ORDER BY id`),
        rows: await all(`SELECT * FROM "sales_order_size_spec_row" ORDER BY id`),
        links: await all(`SELECT id, "triggeredBySalesOrderSpecId" AS spec FROM "contract" ORDER BY id`),
      };
      expect(after.specs).toEqual(before.specs);
      expect(after.rows).toEqual(before.rows);
      expect(after.links).toEqual(before.links);
      expect(after.specs).toHaveLength(3);
      expect(after.rows).toHaveLength(5);
      expect(after.links.map((l: any) => l.spec)).toEqual([1, 2, 3, null]);
    });

    it('up 이후에도 사이즈 행 → 작업명세 조인(FK)이 그대로 동작하고, 새 행의 ID 채번도 이어진다', async () => {
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(queryRunner);
      const joined = await all<{ styleNo: string; n: number }>(
        `SELECT s.styleNo AS styleNo, count(r.id) AS n FROM "sales_order_spec" s JOIN "sales_order_size_spec_row" r ON r."specId" = s.id GROUP BY s.styleNo ORDER BY s.styleNo`,
      );
      expect(joined).toEqual([{ styleNo: 'A', n: 2 }, { styleNo: 'B', n: 1 }, { styleNo: 'C', n: 2 }]);
      await run(`INSERT INTO "sales_order_spec" ("styleNo", "createdAt") VALUES ('D', '2026-09-10')`);
      expect((await all<{ id: number }>(`SELECT max(id) AS id FROM "sales_order_spec"`))[0].id).toBe(4);
    });

    it('down: 원래 이름으로 되돌아오고 데이터도 up 전과 같다(왕복)', async () => {
      const before = {
        specs: await all(`SELECT * FROM "work_order_spec" ORDER BY id`),
        rows: await all(`SELECT * FROM "work_order_size_spec_row" ORDER BY id`),
        links: await all(`SELECT * FROM "contract" ORDER BY id`),
      };
      const m = new RenameWorkOrderToSalesOrderTables1789840000000();
      await m.up(queryRunner);
      await m.down(queryRunner);
      const t = await tables();
      expect(t).toEqual(expect.arrayContaining(['work_order_spec', 'work_order_size_spec_row']));
      expect(t).not.toContain('sales_order_spec');
      expect(t).not.toContain('sales_order_size_spec_row');
      expect(await cols('contract')).toContain('triggeredByWorkOrderSpecId');
      expect(await all(`SELECT * FROM "work_order_spec" ORDER BY id`)).toEqual(before.specs);
      expect(await all(`SELECT * FROM "work_order_size_spec_row" ORDER BY id`)).toEqual(before.rows);
      expect(await all(`SELECT * FROM "contract" ORDER BY id`)).toEqual(before.links);
    });
  });

  describe('TypeORM 제약 이름 관례', () => {
    const naming = new DefaultNamingStrategy();
    it('옛 테이블 이름으로 계산한 이름이 운영 DB(InitialSchema)에 실제로 있는 제약 이름과 정확히 같다 — 계산 방식이 맞다는 증거', () => {
      expect(naming.primaryKeyName('work_order_spec', ['id'])).toBe('PK_bfa139e9b6c0456a62ffb1118b1');
      expect(naming.primaryKeyName('work_order_size_spec_row', ['id'])).toBe('PK_66f5997d7d0d6be8a15029fc38f');
      expect(naming.foreignKeyName('work_order_size_spec_row', ['specId'])).toBe('FK_40b2a69017ba0776c6fc7a9e2fc');
    });
  });

  describe('Postgres 후처리(시퀀스/제약 이름 정렬) — 가짜 Postgres 러너로 발행 SQL 검증', () => {
    const naming = new DefaultNamingStrategy();
    // 테이블 이름을 바꾼 "직후" 상태를 흉내낸다: 시퀀스/제약은 아직 옛 이름
    const makeRunner = (state: 'renamed' | 'aligned-new') => {
      const issued: string[] = [];
      const seqOld: Record<string, string> = { sales_order_spec: 'work_order_spec_id_seq', sales_order_size_spec_row: 'work_order_size_spec_row_id_seq' };
      const rows = (cur: string) => {
        const prev = TABLE_RENAMES.find((t) => t.to === cur)!.from;
        const oldNames = state === 'renamed';
        const pk = oldNames ? naming.primaryKeyName(prev, ['id']) : naming.primaryKeyName(cur, ['id']);
        const base = [{ conname: pk, contype: 'p', cols: ['id'] }];
        if (cur === 'sales_order_size_spec_row') base.push({ conname: oldNames ? naming.foreignKeyName(prev, ['specId']) : naming.foreignKeyName(cur, ['specId']), contype: 'f', cols: ['specId'] });
        const prefix = oldNames ? prev : cur;
        base.push({ conname: `${prefix}_id_not_null`, contype: 'n', cols: ['id'] });
        return base;
      };
      const qr: any = {
        connection: { options: { type: 'postgres' } },
        query: async (sql: string) => {
          issued.push(sql.replace(/\s+/g, ' ').trim());
          const cur = /'"(\w+)"'/.exec(sql)?.[1];
          if (sql.includes('pg_get_serial_sequence') && cur) return [{ seq: `public.${state === 'renamed' ? seqOld[cur] : `${cur}_id_seq`}` }];
          if (sql.includes('FROM pg_constraint') && cur) return rows(cur);
          return [];
        },
      };
      return { qr, issued };
    };

    it('up: 테이블/컬럼 RENAME 뒤에 시퀀스와 PK/FK/NOT NULL 제약 이름을 새 테이블 이름 기준(TypeORM 관례)으로 바꾼다', async () => {
      const { qr, issued } = makeRunner('renamed');
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(qr);
      const ddl = issued.filter((s) => s.startsWith('ALTER'));
      expect(ddl.slice(0, 3)).toEqual([
        'ALTER TABLE "work_order_spec" RENAME TO "sales_order_spec"',
        'ALTER TABLE "work_order_size_spec_row" RENAME TO "sales_order_size_spec_row"',
        `ALTER TABLE "${COLUMN_RENAME.table}" RENAME COLUMN "${COLUMN_RENAME.from}" TO "${COLUMN_RENAME.to}"`,
      ]);
      expect(ddl).toEqual(expect.arrayContaining([
        'ALTER SEQUENCE "work_order_spec_id_seq" RENAME TO "sales_order_spec_id_seq"',
        'ALTER SEQUENCE "work_order_size_spec_row_id_seq" RENAME TO "sales_order_size_spec_row_id_seq"',
        `ALTER TABLE "sales_order_spec" RENAME CONSTRAINT "PK_bfa139e9b6c0456a62ffb1118b1" TO "${naming.primaryKeyName('sales_order_spec', ['id'])}"`,
        `ALTER TABLE "sales_order_size_spec_row" RENAME CONSTRAINT "PK_66f5997d7d0d6be8a15029fc38f" TO "${naming.primaryKeyName('sales_order_size_spec_row', ['id'])}"`,
        `ALTER TABLE "sales_order_size_spec_row" RENAME CONSTRAINT "FK_40b2a69017ba0776c6fc7a9e2fc" TO "${naming.foreignKeyName('sales_order_size_spec_row', ['specId'])}"`,
        'ALTER TABLE "sales_order_spec" RENAME CONSTRAINT "work_order_spec_id_not_null" TO "sales_order_spec_id_not_null"',
      ]));
      expect(ddl.some((s) => /DROP|TRUNCATE|DELETE|INSERT/i.test(s))).toBe(false); // 데이터를 건드리는 문장은 없다
    });

    it('이미 새 이름이면(정렬 완료 상태) 시퀀스/제약 RENAME을 더 발행하지 않는다', async () => {
      const { qr, issued } = makeRunner('aligned-new');
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(qr);
      const extra = issued.filter((s) => s.startsWith('ALTER') && (s.includes('SEQUENCE') || s.includes('RENAME CONSTRAINT')));
      expect(extra).toEqual([]);
    });

    it('제약 컬럼 조회는 attname을 ::text로 캐스팅한다 — 안 하면 pg 드라이버가 name[]을 배열이 아닌 문자열로 돌려줘 PK/FK 이름 해시가 틀어진다(운영 리허설에서 발견)', async () => {
      const { qr, issued } = makeRunner('renamed');
      await new RenameWorkOrderToSalesOrderTables1789840000000().up(qr);
      const select = issued.find((s) => s.includes('FROM pg_constraint'))!;
      expect(select).toContain('attname::text');
      expect(select).not.toMatch(/array_agg\(a\.attname\s/);
    });

    it('컬럼 목록이 문자열("{id}")로 오면 잘못된 이름이 만들어진다는 것을 보여 주는 대조군 — 배열로 받아야 정확한 이름이 나온다', () => {
      const good = naming.primaryKeyName('sales_order_spec', ['id']);
      const bad = naming.primaryKeyName('sales_order_spec', '{id}' as unknown as string[]);
      expect(good).not.toBe(bad);
    });

    it('SQLite 같은 비Postgres 러너에서는 후처리를 하지 않는다(테이블/컬럼 RENAME 3건만)', async () => {
      const issued: string[] = [];
      await new RenameWorkOrderToSalesOrderTables1789840000000().up({ query: async (s: string) => { issued.push(s); return []; } } as any);
      expect(issued).toHaveLength(3);
    });
  });
});
