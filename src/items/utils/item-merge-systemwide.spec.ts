import * as sqlite3 from 'sqlite3';
import { buildSystemWideMergePlan, findSystemWideMergePairs, type SqlExecutor } from './item-merge.util';
import { MergeSystemWideDuplicateItems1789820000000 } from '../../migrations/1789820000000-MergeSystemWideDuplicateItems';

const refs = (o: Record<number, number>) => new Map<number, number>(Object.entries(o).map(([k, v]) => [Number(k), v]));

describe('시스템 전체 중복 Item 병합 계획 (PR-125)', () => {
  describe('buildSystemWideMergePlan — 그룹핑과 정답 선택', () => {
    it('정규화한 이름(줄바꿈/공백 차이 무시)이 같은 Item끼리 묶고, 단독 Item은 무시한다', () => {
      const plan = buildSystemWideMergePlan(
        [{ id: 1, name: '다후다\nLINING' }, { id: 2, name: '다후다\r\nLINING' }, { id: 3, name: '다후다  LINING' }, { id: 4, name: '혼자' }],
        refs({ 1: 1, 2: 5, 3: 2 }),
        new Set(),
      );
      expect(plan.groups).toEqual([{ name: '다후다 LINING', canonicalId: 2, duplicateIds: [1, 3], bomRefs: { 1: 1, 2: 5, 3: 2 } }]);
      expect(plan.pairs).toEqual([
        { duplicateId: 1, canonicalId: 2, name: '다후다 LINING' },
        { duplicateId: 3, canonicalId: 2, name: '다후다 LINING' },
      ]);
    });

    it('정답은 BomItem 참조 건수가 가장 많은 Item — id가 크거나 작든 상관없다', () => {
      const plan = buildSystemWideMergePlan([{ id: 10, name: 'A' }, { id: 20, name: 'A ' }], refs({ 10: 2, 20: 9 }), new Set());
      expect(plan.groups[0].canonicalId).toBe(20);
      const plan2 = buildSystemWideMergePlan([{ id: 10, name: 'A' }, { id: 20, name: 'A ' }], refs({ 10: 9, 20: 2 }), new Set());
      expect(plan2.groups[0].canonicalId).toBe(10);
    });

    it('참조 건수가 동률이면 id가 가장 작은 Item이 정답(입력 순서와 무관하게 결정적), 참조가 전혀 없어도 동일', () => {
      const a = buildSystemWideMergePlan([{ id: 30, name: 'T' }, { id: 5, name: 'T' }, { id: 12, name: 'T' }], refs({ 30: 3, 5: 3, 12: 3 }), new Set());
      const b = buildSystemWideMergePlan([{ id: 12, name: 'T' }, { id: 30, name: 'T' }, { id: 5, name: 'T' }], refs({ 30: 3, 5: 3, 12: 3 }), new Set());
      expect(a).toEqual(b);
      expect(a.groups[0]).toMatchObject({ canonicalId: 5, duplicateIds: [12, 30] });
      expect(buildSystemWideMergePlan([{ id: 9, name: 'Z' }, { id: 4, name: 'Z' }], refs({}), new Set()).groups[0].canonicalId).toBe(4);
    });

    it('동률 중에서도 참조가 더 많은 쪽이 있으면 그쪽(3건 그룹: 2·2·1이면 id 작은 2건 중 작은 id)', () => {
      const plan = buildSystemWideMergePlan([{ id: 7, name: 'Q' }, { id: 3, name: 'Q' }, { id: 8, name: 'Q' }], refs({ 7: 2, 3: 2, 8: 1 }), new Set());
      expect(plan.groups[0]).toMatchObject({ canonicalId: 3, duplicateIds: [7, 8] });
    });

    it('PO/재고/작업지시가 참조하는 Item이 하나라도 있으면 그 그룹 전체를 건너뛴다', () => {
      const plan = buildSystemWideMergePlan(
        [{ id: 1, name: 'R' }, { id: 2, name: 'R' }, { id: 3, name: 'OK' }, { id: 4, name: 'OK' }],
        refs({ 1: 1, 2: 1, 3: 1, 4: 1 }),
        new Set([2]),
      );
      expect(plan.skipped).toEqual([{ name: 'R', ids: [1, 2], reason: 'REFERENCED_BY_PO_INVENTORY_WORKORDER' }]);
      expect(plan.pairs.map((p) => p.duplicateId)).toEqual([4]);
    });

    it('type이 서로 다른 그룹(이름만 같은 다른 종류)은 건너뛰고, 이름이 빈 Item은 묶지 않는다', () => {
      const plan = buildSystemWideMergePlan(
        [{ id: 1, name: 'M', type: 'RAW_MATERIAL' }, { id: 2, name: 'M', type: 'SEMI_FINISHED' }, { id: 3, name: '  ' }, { id: 4, name: '' }],
        refs({}),
        new Set(),
      );
      expect(plan.skipped).toEqual([{ name: 'M', ids: [1, 2], reason: 'TYPE_MISMATCH' }]);
      expect(plan.pairs).toEqual([]);
      expect(plan.groups).toEqual([]);
    });

    it('정답이 다른 짝의 중복이 되는 연쇄는 만들 수 없다(정답은 항상 그룹의 한 Item)', () => {
      const plan = buildSystemWideMergePlan([{ id: 1, name: 'A' }, { id: 2, name: 'A' }, { id: 3, name: 'A' }], refs({ 2: 4 }), new Set());
      const dups = new Set(plan.pairs.map((p) => p.duplicateId));
      expect(plan.pairs.every((p) => !dups.has(p.canonicalId))).toBe(true);
    });
  });

  describe('마이그레이션 실행 — 36그룹 구조(SQLite, FK CASCADE)', () => {
    let db: sqlite3.Database;
    const run = (sql: string) => new Promise<void>((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
    const all = <T = any>(sql: string) => new Promise<T[]>((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows as T[]))));
    const exec: SqlExecutor = { query: async (sql) => (/^\s*select/i.test(sql) ? all(sql) : run(sql).then(() => [])) };
    const queryRunner = { query: (sql: string) => exec.query(sql) } as any;
    const count = async (t: string) => (await all<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t}"`))[0].n;

    // 36그룹 = 2건 31개 + 3건 3개 + 4건 1개 + 5건 1개 = 80 Item (운영에서 확인한 구성과 같다). 이름은 줄바꿈/공백 표기만 다르다.
    const sizes = [...Array(31).fill(2), 3, 3, 3, 4, 5];
    const variants = (g: number, k: number) => [`자재 ${g}`, `자재\r\n${g}`, `자재  ${g}`, `자재\n${g}`, ` 자재 ${g} `][k];
    let nextId = 1;
    const groupIds: number[][] = [];

    beforeEach(async () => {
      nextId = 1; groupIds.length = 0;
      db = new sqlite3.Database(':memory:');
      await run('PRAGMA foreign_keys = ON');
      await run(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, type TEXT)`);
      await run(`CREATE TABLE bom_item_details (id INTEGER PRIMARY KEY AUTOINCREMENT, "bomId" INTEGER, "materialId" INTEGER REFERENCES items(id))`);
      await run(`CREATE TABLE purchase_order (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE)`);
      await run(`CREATE TABLE inventories (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE, quantity REAL)`);
      await run(`CREATE TABLE work_orders (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE)`);
      sizes.forEach((size, g) => {
        groupIds.push(Array.from({ length: size }, () => nextId++));
      });
      for (const [g, ids] of groupIds.entries()) {
        for (const [k, id] of ids.entries()) {
          await run(`INSERT INTO items VALUES (${id}, '${variants(g, k).replace(/\r/g, "' || char(13) || '").replace(/\n/g, "' || char(10) || '")}', 'RAW_MATERIAL')`);
          // 참조 건수: id에 따라 1~3건(같은 그룹 안에서 동률도 생기게 mod 2)
          const n = 1 + ((g + k) % 2);
          for (let r = 0; r < n; r++) await run(`INSERT INTO bom_item_details ("bomId", "materialId") VALUES (${g * 10 + r + 1}, ${id})`);
        }
      }
      // 무관한 단독 Item, 그리고 PO가 참조하는 그룹(건너뛰어야 함)
      await run(`INSERT INTO items VALUES (${nextId}, '단독 자재', 'RAW_MATERIAL')`); const solo = nextId++;
      await run(`INSERT INTO bom_item_details ("bomId", "materialId") VALUES (999, ${solo})`);
      await run(`INSERT INTO items VALUES (${nextId}, '보호 자재', 'RAW_MATERIAL'), (${nextId + 1}, '보호  자재', 'RAW_MATERIAL')`);
      await run(`INSERT INTO bom_item_details ("bomId", "materialId") VALUES (998, ${nextId}), (997, ${nextId + 1})`);
      await run(`INSERT INTO purchase_order VALUES (1, ${nextId + 1})`);
    });
    afterEach(() => new Promise<void>((res) => db.close(() => res())));

    it('실제 36그룹 구조를 그대로 대응표로 만든다: 그룹 36개, Item 80개 → 삭제 44개, 정답은 참조 최다/동률이면 최소 id', async () => {
      const plan = await findSystemWideMergePairs(exec);
      expect(plan.groups).toHaveLength(36);
      expect(plan.groups.reduce((a, g) => a + 1 + g.duplicateIds.length, 0)).toBe(80);
      expect(plan.pairs).toHaveLength(44);
      // 독립 검산: 그룹마다 (참조 수 내림차순, id 오름차순) 첫 번째가 정답
      const refOf = async (id: number) => (await all<{ n: number }>(`SELECT COUNT(*) AS n FROM bom_item_details WHERE "materialId" = ${id}`))[0].n;
      for (const [g, ids] of groupIds.entries()) {
        const withRefs = await Promise.all(ids.map(async (id) => ({ id, n: await refOf(id) })));
        const expected = withRefs.sort((a, b) => b.n - a.n || a.id - b.id)[0].id;
        expect(plan.groups.find((x) => x.canonicalId === expected || x.duplicateIds.includes(expected))!.canonicalId).toBe(expected);
        expect(plan.groups.filter((x) => ids.includes(x.canonicalId))).toHaveLength(1);
      }
      // PO가 참조하는 그룹과 단독 Item은 대상이 아니다
      expect(plan.skipped.map((s) => [s.name, s.reason])).toEqual([['보호 자재', 'REFERENCED_BY_PO_INVENTORY_WORKORDER']]);
      let expectedRepoints = 0;
      for (const p of plan.pairs) expectedRepoints += await refOf(p.duplicateId);
      expect(plan.expectedBomRepoints).toBe(expectedRepoints);
    });

    it('마이그레이션 up: 중복 44개만 삭제하고 BomItem 참조를 정답으로 옮기며, 건너뛴 그룹/단독 Item/PO는 그대로다', async () => {
      const logs: string[] = [];
      const spy = jest.spyOn(console, 'log').mockImplementation((m: string) => { logs.push(String(m)); });
      const plan = await findSystemWideMergePairs(exec);
      const itemsBefore = await count('items');
      const bomBefore = await count('bom_item_details');
      const poBefore = await count('purchase_order');

      await new MergeSystemWideDuplicateItems1789820000000().up(queryRunner);
      spy.mockRestore();

      // 실행 전 예상 리포인트 행 수와 실행 후 실제 행 수가 로그에서 같다
      expect(logs.find((l) => l.includes('병합 대상 그룹 36개, 삭제 예정 Item 44개'))).toContain(`예상 bom_item_details 리포인트 ${plan.expectedBomRepoints}행`);
      expect(logs.find((l) => l.includes('리포인트한 행 수'))).toContain(`"bom_item_details":${plan.expectedBomRepoints}`);
      expect(logs.some((l) => l.includes('삭제한 중복 Item: 44개'))).toBe(true);
      expect(await count('items')).toBe(itemsBefore - 44);
      expect(await count('bom_item_details')).toBe(bomBefore); // 행은 하나도 사라지지 않고 materialId만 바뀐다
      expect(await count('purchase_order')).toBe(poBefore);
      // 그룹마다 정답 Item 하나만 남았고, 그 그룹 Item을 참조하던 모든 BomItem이 정답을 가리킨다
      for (const ids of groupIds) {
        const alive = await all<{ id: number }>(`SELECT id FROM items WHERE id IN (${ids.join(',')})`);
        expect(alive).toHaveLength(1);
        const mids = (await all<{ m: number }>(`SELECT DISTINCT "materialId" AS m FROM bom_item_details WHERE "materialId" IN (${ids.join(',')})`)).map((r) => r.m);
        expect(mids).toEqual([alive[0].id]);
      }
      // 건너뛴 보호 그룹의 두 Item과 단독 Item은 그대로
      expect((await all<any>(`SELECT name FROM items WHERE name LIKE '보호%' OR name = '단독 자재' ORDER BY id`)).length).toBe(3);
      // 삭제된 Item이 정확히 대응표의 중복 Item들
      const dead = plan.pairs.map((p) => p.duplicateId);
      expect(await all(`SELECT id FROM items WHERE id IN (${dead.join(',')})`)).toEqual([]);
    });

    it('두 번째 실행은 아무것도 하지 않는다(멱등)', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const m = new MergeSystemWideDuplicateItems1789820000000();
      await m.up(queryRunner);
      const after = await count('items');
      await m.up(queryRunner);
      spy.mockRestore();
      expect(await count('items')).toBe(after);
      expect((await findSystemWideMergePairs(exec)).pairs).toEqual([]);
    });

    it('참조가 없는 그룹만 처리한다: 병합 직전에 PO가 참조하게 된 그룹은 안전하게 건너뛴다(CASCADE로 PO가 사라지지 않는다)', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const victim = groupIds[0]; // 2건 그룹
      await run(`INSERT INTO purchase_order VALUES (2, ${victim[1]})`);
      const poBefore = await count('purchase_order');
      const itemsBefore = await count('items');

      await new MergeSystemWideDuplicateItems1789820000000().up(queryRunner);
      spy.mockRestore();

      expect(await count('purchase_order')).toBe(poBefore);
      expect((await all(`SELECT id FROM items WHERE id IN (${victim.join(',')})`)).length).toBe(2); // 그 그룹은 그대로
      expect(await count('items')).toBe(itemsBefore - 43); // 나머지 35그룹(44 - 그 그룹의 1개)만 병합
    });
  });
});
