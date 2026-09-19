import * as sqlite3 from 'sqlite3';
import {
  buildMergePairs,
  countReferencesTo,
  findMergePairsForStyle,
  mergeDuplicateItems,
  planInventoryConsolidation,
  type SqlExecutor,
} from './item-merge.util';

describe('중복 자재 마스터(Item) 병합 (PR-123)', () => {
  describe('buildMergePairs — 정규화 이름 매칭', () => {
    it('줄바꿈(\\n/\\r\\n)·연속 공백만 다른 이름을 같은 자재로 짝짓는다(실제 MB6YSLM115Z 패턴)', () => {
      const { pairs, unmatched } = buildMergePairs(
        [{ id: 1, name: '(싸개패드)\n다후다' }, { id: 3, name: '다후다\nLINING\n오비해리, 주머니감' }],
        [{ id: 110, name: '(싸개패드)\r\n다후다' }, { id: 195, name: '다후다\r\nLINING\r\n오비해리,  주머니감' }],
      );
      expect(pairs).toEqual([
        { duplicateId: 1, canonicalId: 110, name: '(싸개패드) 다후다' },
        { duplicateId: 3, canonicalId: 195, name: '다후다 LINING 오비해리, 주머니감' },
      ]);
      expect(unmatched).toEqual([]);
    });

    it('이미 같은 레코드(id 동일)는 건너뛰고, 같은 Item이 여러 번 나와도 한 번만 짝짓는다', () => {
      const { pairs } = buildMergePairs([{ id: 5, name: 'X' }, { id: 5, name: 'X' }, { id: 6, name: 'Y' }], [{ id: 5, name: 'X' }, { id: 60, name: 'Y' }]);
      expect(pairs).toEqual([{ duplicateId: 6, canonicalId: 60, name: 'Y' }]);
    });

    it('매칭되는 정답이 없거나(NO_MATCH) 2개 이상이면(AMBIGUOUS) 임의로 고르지 않고 unmatched로 돌려준다', () => {
      const { pairs, unmatched } = buildMergePairs(
        [{ id: 1, name: '없는 자재' }, { id: 2, name: '모호 자재' }],
        [{ id: 40, name: '모호  자재' }, { id: 41, name: '모호\n자재' }],
      );
      expect(pairs).toEqual([]);
      expect(unmatched).toEqual([
        { id: 1, name: '없는 자재', reason: 'NO_MATCH', candidates: [] },
        { id: 2, name: '모호 자재', reason: 'AMBIGUOUS', candidates: [40, 41] },
      ]);
    });

    it('이름이 비슷해 보여도 글자가 다르면 다른 자재(다후다 ≠ 다우다)', () => {
      expect(buildMergePairs([{ id: 1, name: '다후다' }], [{ id: 2, name: '다우다' }]).pairs).toEqual([]);
    });
  });

  describe('planInventoryConsolidation — 재고 중복 시 수량 합산', () => {
    const pairs = [{ duplicateId: 1, canonicalId: 10, name: 'a' }, { duplicateId: 2, canonicalId: 20, name: 'b' }];

    it('정답/중복 Item에 각각 재고 행이 있으면 정답 행에 합산하고 중복 행은 삭제(이중 계산 방지)', () => {
      const ops = planInventoryConsolidation([{ id: 1, itemId: 1, quantity: 7 }, { id: 2, itemId: 10, quantity: '3' }], pairs);
      expect(ops).toEqual([{ kind: 'update', id: 2, itemId: 10, quantity: 10 }, { kind: 'delete', id: 1 }]);
    });

    it('정답 행이 없고 중복 행만 있으면 그 행의 itemId만 정답으로 옮긴다(수량 그대로)', () => {
      expect(planInventoryConsolidation([{ id: 3, itemId: 2, quantity: 4 }], pairs)).toEqual([{ kind: 'update', id: 3, itemId: 20, quantity: 4 }]);
    });

    it('한 정답에 중복이 여러 개고 행도 여러 개면 전부 합산하고 소수 오차 없이 계산', () => {
      const multi = [{ duplicateId: 1, canonicalId: 10, name: 'a' }, { duplicateId: 3, canonicalId: 10, name: 'a' }];
      const ops = planInventoryConsolidation([{ id: 1, itemId: 1, quantity: 0.1 }, { id: 2, itemId: 3, quantity: 0.2 }, { id: 3, itemId: 10, quantity: 0.3 }, { id: 4, itemId: 10, quantity: 1 }], multi);
      expect(ops).toEqual([
        { kind: 'update', id: 3, itemId: 10, quantity: 1.6 }, // 정답 Item 행 중 id가 가장 작은 행에 합산
        { kind: 'delete', id: 1 },
        { kind: 'delete', id: 2 },
        { kind: 'delete', id: 4 },
      ]);
    });

    it('정답 행만 있거나 관련 없는 Item의 재고는 건드리지 않는다', () => {
      expect(planInventoryConsolidation([{ id: 1, itemId: 10, quantity: 5 }, { id: 2, itemId: 99, quantity: 9 }], pairs)).toEqual([]);
      expect(planInventoryConsolidation([], pairs)).toEqual([]);
    });
  });

  describe('mergeDuplicateItems — 실제 SQL 실행(SQLite, FK CASCADE 포함)', () => {
    let db: sqlite3.Database;
    const run = (sql: string) => new Promise<void>((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
    const all = <T = any>(sql: string) => new Promise<T[]>((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows as T[]))));
    const executed: string[] = [];
    // 운영과 같은 방식으로: SELECT는 행 배열, 그 외는 빈 배열
    const exec: SqlExecutor = {
      query: async (sql) => {
        executed.push(sql);
        return /^\s*select/i.test(sql) ? all(sql) : run(sql).then(() => []);
      },
    };
    const count = async (table: string) => (await all<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`))[0].n;

    beforeEach(async () => {
      executed.length = 0;
      db = new sqlite3.Database(':memory:');
      await run('PRAGMA foreign_keys = ON');
      // 운영 스키마와 같은 삭제 규칙: BomItem은 NO ACTION, PO/Inventory/WorkOrder는 CASCADE
      await run(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)`);
      await run(`CREATE TABLE bom_master (id INTEGER PRIMARY KEY, "styleStyleNo" TEXT, "isActive" INTEGER NOT NULL DEFAULT 1)`);
      await run(`CREATE TABLE bom_item_details (id INTEGER PRIMARY KEY AUTOINCREMENT, "bomId" INTEGER, "materialId" INTEGER REFERENCES items(id))`);
      await run(`CREATE TABLE purchase_order (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE, quantity INTEGER)`);
      await run(`CREATE TABLE inventories (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE, quantity REAL)`);
      await run(`CREATE TABLE work_orders (id INTEGER PRIMARY KEY, "itemId" INTEGER REFERENCES items(id) ON DELETE CASCADE)`);

      for (const [id, name] of [[1, 'A\nx'], [2, 'B  y'], [3, '공통'], [10, 'A x'], [20, 'B y'], [30, '무관']] as [number, string][]) {
        await run(`INSERT INTO items VALUES (${id}, '${name.replace(/\n/g, "' || char(10) || '")}')`);
      }
      // 스타일 S: 오래된 비활성 BOM #1(중복 Item 1,2 + 공통 3) / 활성 BOM #2(정답 10,20 + 공통 3). 다른 스타일 T의 BOM #5도 중복 Item 1을 쓴다.
      await run(`INSERT INTO bom_master VALUES (1, 'S', 0), (2, 'S', 1), (5, 'T', 1)`);
      await run(`INSERT INTO bom_item_details ("bomId", "materialId") VALUES (1,1),(1,2),(1,3),(2,10),(2,20),(2,3),(5,1)`);
      await run(`INSERT INTO purchase_order VALUES (1, 1, 5), (2, 10, 6), (3, 3, 7)`);
      await run(`INSERT INTO work_orders VALUES (1, 2)`);
      await run(`INSERT INTO inventories VALUES (1, 1, 7), (2, 10, 3), (3, 2, 4), (4, 30, 9)`);
    });
    afterEach(() => new Promise<void>((res) => db.close(() => res())));

    it('대응표를 만든다: 활성 BOM이 참조하는 Item이 정답, 나머지 BOM의 Item이 중복(공통 Item은 제외)', async () => {
      const r = await findMergePairsForStyle(exec, 'S');
      expect(r.activeBomId).toBe(2);
      expect(r.sourceBomIds).toEqual([1]);
      expect(r.pairs.map((p) => [p.duplicateId, p.canonicalId])).toEqual([[1, 10], [2, 20]]);
      expect(r.unmatched).toEqual([]);
    });

    it('전부 옮기고 재고를 합산한 뒤 중복 Item만 삭제하며, 그 사이 PO/재고/작업지시 행은 하나도 사라지지 않는다', async () => {
      const { pairs } = await findMergePairsForStyle(exec, 'S');
      const before = { po: await count('purchase_order'), wo: await count('work_orders'), bom: await count('bom_item_details') };

      const report = await mergeDuplicateItems(exec, pairs);

      expect(report.repointed).toEqual({ bom_item_details: 3, purchase_order: 1, work_orders: 1 }); // Item 1: BOM 2행(#1,#5), Item 2: BOM 1행
      expect(report.inventory).toMatchObject({ rowsRepointed: 1, rowsDeleted: 1 });
      expect(report.deletedItems).toBe(2);

      expect((await all<any>(`SELECT id FROM items ORDER BY id`)).map((r) => r.id)).toEqual([3, 10, 20, 30]);
      // CASCADE로 지워진 행이 없다
      expect(await count('purchase_order')).toBe(before.po);
      expect(await count('work_orders')).toBe(before.wo);
      expect(await count('bom_item_details')).toBe(before.bom);
      expect((await all<any>(`SELECT "itemId" FROM purchase_order ORDER BY id`)).map((r) => r.itemId)).toEqual([10, 10, 3]);
      expect((await all<any>(`SELECT "itemId" FROM work_orders`)).map((r) => r.itemId)).toEqual([20]);
      // 다른 스타일(T)의 BOM도 정답 Item을 가리킨다
      expect((await all<any>(`SELECT "materialId" FROM bom_item_details WHERE "bomId" = 5`)).map((r) => r.materialId)).toEqual([10]);
      // 스타일 S의 두 BOM이 이제 같은 Item 집합을 참조
      const mids = async (bom: number) => (await all<any>(`SELECT "materialId" FROM bom_item_details WHERE "bomId" = ${bom} ORDER BY "materialId"`)).map((r) => r.materialId);
      expect(await mids(1)).toEqual(await mids(2));
    });

    it('재고 중복: 정답/중복 행은 수량을 합산해 한 행만 남기고(7+3=10), 정답 행이 없던 중복 행은 itemId만 옮기며, 무관한 재고는 그대로', async () => {
      const { pairs } = await findMergePairsForStyle(exec, 'S');
      await mergeDuplicateItems(exec, pairs);
      const inv = await all<any>(`SELECT id, "itemId", quantity FROM inventories ORDER BY id`);
      expect(inv).toEqual([
        { id: 2, itemId: 10, quantity: 10 }, // 10번 Item: 기존 3 + 중복(1번 Item)의 7
        { id: 3, itemId: 20, quantity: 4 }, // 20번 Item 행이 없어 중복 행(2번 Item)을 옮김
        { id: 4, itemId: 30, quantity: 9 },
      ]);
      expect(inv.reduce((a, r) => a + r.quantity, 0)).toBe(7 + 3 + 4 + 9); // 총 재고 수량 보존(이중 계산도 유실도 없다)
    });

    it('삭제 순서: Item 삭제는 모든 리포인트와 "참조 0건" 확인 쿼리 뒤에 단 한 번만 실행된다', async () => {
      const { pairs } = await findMergePairsForStyle(exec, 'S');
      executed.length = 0;
      await mergeDuplicateItems(exec, pairs);

      const idxDelete = executed.findIndex((q) => /^DELETE FROM "items"/.test(q));
      const idxLastUpdate = executed.map((q, i) => (/^(UPDATE|DELETE FROM "inventories")/.test(q) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const idxLastRefCheck = executed.map((q, i) => (/^SELECT COUNT\(\*\) AS n FROM "(bom_item_details|purchase_order|inventories|work_orders)" WHERE "(materialId|itemId)" IN/.test(q) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      expect(idxDelete).toBeGreaterThan(-1);
      expect(executed.filter((q) => /^DELETE FROM "items"/.test(q))).toHaveLength(1);
      expect(idxDelete).toBeGreaterThan(idxLastUpdate);
      expect(idxDelete).toBeGreaterThan(idxLastRefCheck);
      expect(idxLastRefCheck).toBeGreaterThan(idxLastUpdate);
    });

    it('참조가 하나라도 남아 있으면 Item을 삭제하지 않고 중단한다(CASCADE로 행이 사라지는 사고 방지)', async () => {
      const { pairs } = await findMergePairsForStyle(exec, 'S');
      // purchase_order 리포인트가 (어떤 이유로) 실행되지 않은 상황을 흉내낸다
      const broken: SqlExecutor = { query: (sql) => (/^UPDATE "purchase_order"/.test(sql) ? Promise.resolve([]) : exec.query(sql)) };
      const poBefore = await count('purchase_order');

      await expect(mergeDuplicateItems(broken, pairs)).rejects.toThrow(/삭제를 중단/);

      expect((await all<any>(`SELECT id FROM items ORDER BY id`)).map((r) => r.id)).toEqual([1, 2, 3, 10, 20, 30]); // 하나도 안 지워졌다
      expect(await count('purchase_order')).toBe(poBefore); // PO도 그대로
      expect(executed.some((q) => /^DELETE FROM "items"/.test(q))).toBe(false);
    });

    it('전제를 어기고 CASCADE 관계의 Item을 그냥 지우면 PO가 통째로 사라진다는 것을 보여준다(그래서 순서가 중요하다)', async () => {
      await run(`DELETE FROM work_orders`); await run(`DELETE FROM inventories`);
      await run(`DELETE FROM bom_item_details WHERE "materialId" = 1`); // NO ACTION 제약 회피용
      await run(`DELETE FROM items WHERE id = 1`);
      expect((await all<any>(`SELECT id FROM purchase_order ORDER BY id`)).map((r) => r.id)).toEqual([2, 3]); // PO #1이 CASCADE로 삭제됨
    });

    it('두 번째 실행은 아무것도 하지 않는다(멱등)', async () => {
      const first = await findMergePairsForStyle(exec, 'S');
      await mergeDuplicateItems(exec, first.pairs);
      const second = await findMergePairsForStyle(exec, 'S');
      expect(second.pairs).toEqual([]);
      const report = await mergeDuplicateItems(exec, second.pairs);
      expect(report.deletedItems).toBe(0);
    });

    it('짝을 찾지 못하거나 모호한 Item은 병합·삭제하지 않는다', async () => {
      await run(`INSERT INTO items VALUES (50, '짝 없음'), (60, '모   호'), (61, '모  호'), (62, '모 호')`);
      await run(`INSERT INTO bom_item_details ("bomId", "materialId") VALUES (1,50),(1,60),(2,61),(2,62)`);
      const r = await findMergePairsForStyle(exec, 'S');
      expect(r.pairs.map((p) => p.duplicateId)).toEqual([1, 2]);
      expect(r.unmatched.map((u) => [u.id, u.reason])).toEqual([[50, 'NO_MATCH'], [60, 'AMBIGUOUS']]);
      await mergeDuplicateItems(exec, r.pairs);
      expect((await all<any>(`SELECT id FROM items WHERE id IN (50, 60)`)).length).toBe(2);
    });

    it('스타일이 없거나 BOM이 1건뿐이면 병합할 것이 없다', async () => {
      expect((await findMergePairsForStyle(exec, 'NOPE')).pairs).toEqual([]);
      expect((await findMergePairsForStyle(exec, 'T')).pairs).toEqual([]);
    });

    it('countReferencesTo: 4개 테이블의 참조 수를 센다', async () => {
      expect(await countReferencesTo(exec, [1, 2])).toEqual({ bom_item_details: 3, purchase_order: 1, inventories: 2, work_orders: 1 });
      expect(await countReferencesTo(exec, [])).toEqual({ bom_item_details: 0, purchase_order: 0, inventories: 0, work_orders: 0 });
    });
  });
});
