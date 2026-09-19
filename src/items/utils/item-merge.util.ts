import { normalizeMaterialName, pickActiveBom } from '../../boms/utils/active-bom.util';

// PR-123: 같은 자재가 줄바꿈/공백 표기만 다른 이름으로 여러 번 등록된 중복 Item(자재 마스터)을 하나로 합친다.
// 이 파일은 (1) 어떤 Item을 어디로 합칠지 정하는 순수 로직, (2) 참조를 옮기고 검증한 뒤에만 삭제하는 실행 로직을 담는다.
//
// 삭제 순서가 중요하다: PurchaseOrder/Inventory/WorkOrder의 Item 관계는 onDelete CASCADE라, 참조를 옮기기 전에
// 중복 Item을 지우면 그 행들이 통째로 삭제된다. 그래서 항상 [참조 이동 → 참조 0건 확인 → Item 삭제] 순서로만 진행하고,
// 확인 단계에서 하나라도 남아 있으면 삭제하지 않고 예외를 던져(마이그레이션 트랜잭션 롤백) 아무것도 지워지지 않게 한다.

export interface MergeCandidateItem {
  id: number;
  name: string;
}

export interface MergePair {
  duplicateId: number;
  canonicalId: number;
  name: string;
}

export interface UnmatchedItem {
  id: number;
  name: string;
  reason: 'NO_MATCH' | 'AMBIGUOUS';
  candidates: number[];
}

// source(합쳐져 사라질 쪽, 예: 비활성 BOM들이 참조하는 Item)를 canonical(정답, 예: 활성 BOM이 참조하는 Item)에
// 정규화한 이름으로 짝짓는다. 이름이 같은 canonical이 정확히 1개일 때만 짝을 만들고, 0개(매칭 불가)나 2개 이상(모호)이면
// 임의로 고르지 않고 unmatched로 돌려준다. id가 같으면(이미 같은 Item) 합칠 게 없어 건너뛴다.
export function buildMergePairs(
  sourceItems: MergeCandidateItem[],
  canonicalItems: MergeCandidateItem[],
): { pairs: MergePair[]; unmatched: UnmatchedItem[] } {
  const canonByName = new Map<string, Set<number>>();
  for (const c of canonicalItems) {
    const key = normalizeMaterialName(c.name);
    canonByName.set(key, (canonByName.get(key) ?? new Set<number>()).add(c.id));
  }
  const canonicalIds = new Set(canonicalItems.map((c) => c.id));

  const pairs = new Map<number, MergePair>();
  const unmatched = new Map<number, UnmatchedItem>();
  for (const s of sourceItems) {
    if (pairs.has(s.id) || unmatched.has(s.id)) continue;
    if (canonicalIds.has(s.id)) continue; // 이미 정답 쪽 Item과 같은 레코드
    const candidates = [...(canonByName.get(normalizeMaterialName(s.name)) ?? [])].sort((a, b) => a - b);
    if (candidates.length === 1) pairs.set(s.id, { duplicateId: s.id, canonicalId: candidates[0], name: normalizeMaterialName(s.name) });
    else unmatched.set(s.id, { id: s.id, name: normalizeMaterialName(s.name), reason: candidates.length === 0 ? 'NO_MATCH' : 'AMBIGUOUS', candidates });
  }

  const list = [...pairs.values()].sort((a, b) => a.duplicateId - b.duplicateId);
  // 안전장치: 사라질 Item이 다른 짝의 정답이 되는 연쇄(a→b, b→c)는 만들지 않는다.
  const dupSet = new Set(list.map((p) => p.duplicateId));
  const chained = list.find((p) => dupSet.has(p.canonicalId));
  if (chained) throw new Error(`병합 대응표가 연쇄되어 있습니다: ${chained.duplicateId} → ${chained.canonicalId}는 다른 짝의 중복 Item입니다.`);
  return { pairs: list, unmatched: [...unmatched.values()] };
}

export interface InventoryRow {
  id: number;
  itemId: number;
  quantity: number | string;
}

export type InventoryOp =
  | { kind: 'update'; id: number; itemId: number; quantity: number }
  | { kind: 'delete'; id: number };

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

// Inventory는 itemId에 유니크 제약이 없어 정답/중복 Item에 각각 재고 행이 있을 수 있다. 재고가 이중 계산되지 않도록
// 정답 Item 기준으로 한 행에 합산하고 나머지 행은 지운다(정답 행이 있으면 그 행, 없으면 id가 가장 작은 행을 남긴다).
export function planInventoryConsolidation(rows: InventoryRow[], pairs: MergePair[]): InventoryOp[] {
  const dupsByCanonical = new Map<number, Set<number>>();
  for (const p of pairs) dupsByCanonical.set(p.canonicalId, (dupsByCanonical.get(p.canonicalId) ?? new Set<number>()).add(p.duplicateId));

  const ops: InventoryOp[] = [];
  for (const [canonicalId, dups] of dupsByCanonical) {
    const involved = rows.filter((r) => r.itemId === canonicalId || dups.has(r.itemId)).sort((a, b) => a.id - b.id);
    if (involved.length === 0) continue;
    const keep = involved.find((r) => r.itemId === canonicalId) ?? involved[0];
    const total = round4(involved.reduce((a, r) => a + (Number(r.quantity) || 0), 0));
    const needsWrite = keep.itemId !== canonicalId || involved.length > 1;
    if (needsWrite) ops.push({ kind: 'update', id: keep.id, itemId: canonicalId, quantity: total });
    for (const r of involved) if (r.id !== keep.id) ops.push({ kind: 'delete', id: r.id });
  }
  return ops;
}

export interface SqlExecutor {
  query(sql: string): Promise<any>;
}

export interface MergeReport {
  pairs: MergePair[];
  repointed: { bom_item_details: number; purchase_order: number; work_orders: number };
  // rowsRepointed: 정답 Item 행이 없어 itemId만 옮긴 재고 행 / rowsDeleted: 정답 행에 수량을 합산하고 지운 중복 재고 행
  inventory: { rowsRepointed: number; rowsDeleted: number; ops: InventoryOp[] };
  deletedItems: number;
}

const assertInts = (ids: number[]) => {
  for (const id of ids) if (!Number.isInteger(id)) throw new Error(`정수가 아닌 id: ${id}`);
};

const countRows = async (exec: SqlExecutor, sql: string): Promise<number> => {
  const rows = await exec.query(sql);
  return Number(rows?.[0]?.n ?? 0);
};

// 중복 Item을 참조하는 행 수(4개 테이블 합계). 삭제 전 반드시 0이어야 한다.
export async function countReferencesTo(exec: SqlExecutor, ids: number[]): Promise<Record<string, number>> {
  assertInts(ids);
  if (ids.length === 0) return { bom_item_details: 0, purchase_order: 0, inventories: 0, work_orders: 0 };
  const list = ids.join(',');
  return {
    bom_item_details: await countRows(exec, `SELECT COUNT(*) AS n FROM "bom_item_details" WHERE "materialId" IN (${list})`),
    purchase_order: await countRows(exec, `SELECT COUNT(*) AS n FROM "purchase_order" WHERE "itemId" IN (${list})`),
    inventories: await countRows(exec, `SELECT COUNT(*) AS n FROM "inventories" WHERE "itemId" IN (${list})`),
    work_orders: await countRows(exec, `SELECT COUNT(*) AS n FROM "work_orders" WHERE "itemId" IN (${list})`),
  };
}

// 병합 실행. 호출하는 쪽(마이그레이션)의 트랜잭션 안에서 실행해야 한다.
export async function mergeDuplicateItems(exec: SqlExecutor, pairs: MergePair[]): Promise<MergeReport> {
  assertInts(pairs.flatMap((p) => [p.duplicateId, p.canonicalId]));
  const report: MergeReport = {
    pairs,
    repointed: { bom_item_details: 0, purchase_order: 0, work_orders: 0 },
    inventory: { rowsRepointed: 0, rowsDeleted: 0, ops: [] },
    deletedItems: 0,
  };
  if (pairs.length === 0) return report;

  // 1~2단계: 중복 Item을 참조하는 모든 행을 정답 Item으로 옮긴다(BomItem은 스타일과 무관하게 전체 테이블).
  for (const p of pairs) {
    report.repointed.bom_item_details += await countRows(exec, `SELECT COUNT(*) AS n FROM "bom_item_details" WHERE "materialId" = ${p.duplicateId}`);
    await exec.query(`UPDATE "bom_item_details" SET "materialId" = ${p.canonicalId} WHERE "materialId" = ${p.duplicateId}`);

    report.repointed.purchase_order += await countRows(exec, `SELECT COUNT(*) AS n FROM "purchase_order" WHERE "itemId" = ${p.duplicateId}`);
    await exec.query(`UPDATE "purchase_order" SET "itemId" = ${p.canonicalId} WHERE "itemId" = ${p.duplicateId}`);

    report.repointed.work_orders += await countRows(exec, `SELECT COUNT(*) AS n FROM "work_orders" WHERE "itemId" = ${p.duplicateId}`);
    await exec.query(`UPDATE "work_orders" SET "itemId" = ${p.canonicalId} WHERE "itemId" = ${p.duplicateId}`);
  }

  // Inventory: 유니크 제약이 없으므로 단순 UPDATE가 아니라 정답 Item 기준으로 수량을 합산해 한 행만 남긴다.
  const allIds = [...new Set(pairs.flatMap((p) => [p.duplicateId, p.canonicalId]))];
  const invRows: InventoryRow[] = (await exec.query(`SELECT "id", "itemId", "quantity" FROM "inventories" WHERE "itemId" IN (${allIds.join(',')}) ORDER BY "id"`)) ?? [];
  const invOps = planInventoryConsolidation(invRows.map((r) => ({ id: Number(r.id), itemId: Number(r.itemId), quantity: r.quantity })), pairs);
  for (const op of invOps) {
    if (op.kind === 'update') {
      const wasDup = invRows.find((r) => Number(r.id) === op.id && Number(r.itemId) !== op.itemId);
      await exec.query(`UPDATE "inventories" SET "itemId" = ${op.itemId}, "quantity" = ${op.quantity} WHERE "id" = ${op.id}`);
      if (wasDup) report.inventory.rowsRepointed += 1;
    } else {
      await exec.query(`DELETE FROM "inventories" WHERE "id" = ${op.id}`);
      report.inventory.rowsDeleted += 1;
    }
  }
  report.inventory.ops = invOps;

  // 3단계: 중복 Item을 참조하는 행이 정말 0건인지 다시 확인한다. 하나라도 남아 있으면 삭제하지 않고 중단한다.
  const dupIds = pairs.map((p) => p.duplicateId);
  const leftover = await countReferencesTo(exec, dupIds);
  const leftoverTotal = Object.values(leftover).reduce((a, n) => a + n, 0);
  if (leftoverTotal > 0) {
    throw new Error(`중복 Item을 참조하는 행이 남아 있어 삭제를 중단합니다: ${JSON.stringify(leftover)}`);
  }

  // 4단계: 이제서야 중복 Item 삭제.
  await exec.query(`DELETE FROM "items" WHERE "id" IN (${dupIds.join(',')})`);
  report.deletedItems = dupIds.length;
  return report;
}

// 한 스타일에서 "활성 BOM이 참조하는 Item"을 정답, "나머지 BOM들이 참조하는 Item"을 중복 후보로 놓고 병합 대응표를 만든다.
export async function findMergePairsForStyle(exec: SqlExecutor, styleNo: string): Promise<{ pairs: MergePair[]; unmatched: UnmatchedItem[]; activeBomId: number | null; sourceBomIds: number[] }> {
  const safeStyle = styleNo.replace(/'/g, "''");
  const boms: { id: number; isActive: boolean | number | null }[] = (await exec.query(`SELECT "id", "isActive" FROM "bom_master" WHERE "styleStyleNo" = '${safeStyle}' ORDER BY "id"`)) ?? [];
  const active = pickActiveBom(boms.map((b) => ({ id: Number(b.id), isActive: b.isActive === null ? undefined : !!b.isActive })));
  if (!active) return { pairs: [], unmatched: [], activeBomId: null, sourceBomIds: [] };
  const sourceBomIds = boms.map((b) => Number(b.id)).filter((id) => id !== active.id);
  if (sourceBomIds.length === 0) return { pairs: [], unmatched: [], activeBomId: active.id, sourceBomIds };

  const itemsOf = async (bomIds: number[]): Promise<MergeCandidateItem[]> =>
    ((await exec.query(`SELECT DISTINCT i."id" AS id, i."name" AS name FROM "bom_item_details" d JOIN "items" i ON i."id" = d."materialId" WHERE d."bomId" IN (${bomIds.join(',')}) ORDER BY i."id"`)) ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name ?? '') }));

  const { pairs, unmatched } = buildMergePairs(await itemsOf(sourceBomIds), await itemsOf([active.id]));
  return { pairs, unmatched, activeBomId: active.id, sourceBomIds };
}

export interface SystemWideItem {
  id: number;
  name: string;
  type?: string | null;
}

export interface SystemWideGroup {
  name: string;
  canonicalId: number;
  duplicateIds: number[];
  // 그룹 내 각 Item의 BomItem 참조 건수(정답 선택 근거)
  bomRefs: Record<number, number>;
}

export interface SkippedGroup {
  name: string;
  ids: number[];
  reason: 'REFERENCED_BY_PO_INVENTORY_WORKORDER' | 'TYPE_MISMATCH';
}

// 순수 로직: 정규화한 이름이 같은 Item을 그룹으로 묶고, 그룹마다 "BomItem 참조 건수가 가장 많은 Item"을 정답으로,
// 나머지를 중복으로 정한다(동률이면 id가 가장 작은 쪽 — 결정적). 안전을 위해 다음 그룹은 통째로 건너뛴다:
//  - 그룹 안 어느 Item이든 PurchaseOrder/Inventory/WorkOrder가 참조하는 경우(이 세 관계는 CASCADE라 신중해야 한다)
//  - 그룹 안 Item의 type이 서로 다른 경우(이름만 같고 다른 종류의 자재일 수 있다)
// 이름이 비어 있는 Item은 같은 자재로 볼 근거가 없어 그룹으로 묶지 않는다.
export function buildSystemWideMergePlan(
  items: SystemWideItem[],
  bomRefCounts: Map<number, number>,
  referencedByOthers: Set<number>,
): { pairs: MergePair[]; groups: SystemWideGroup[]; skipped: SkippedGroup[] } {
  const byName = new Map<string, SystemWideItem[]>();
  for (const it of items) {
    const key = normalizeMaterialName(it.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), it]);
  }

  const groups: SystemWideGroup[] = [];
  const skipped: SkippedGroup[] = [];
  const pairs: MergePair[] = [];
  for (const [name, members] of [...byName].sort((a, b) => a[1][0].id - b[1][0].id)) {
    if (members.length < 2) continue;
    const ids = members.map((m) => m.id).sort((a, b) => a - b);
    if (members.some((m) => referencedByOthers.has(m.id))) {
      skipped.push({ name, ids, reason: 'REFERENCED_BY_PO_INVENTORY_WORKORDER' });
      continue;
    }
    if (new Set(members.map((m) => m.type ?? '')).size > 1) {
      skipped.push({ name, ids, reason: 'TYPE_MISMATCH' });
      continue;
    }
    const refs = (id: number) => bomRefCounts.get(id) ?? 0;
    const canonicalId = [...ids].sort((a, b) => refs(b) - refs(a) || a - b)[0];
    const duplicateIds = ids.filter((id) => id !== canonicalId);
    groups.push({ name, canonicalId, duplicateIds, bomRefs: Object.fromEntries(ids.map((id) => [id, refs(id)])) });
    for (const d of duplicateIds) pairs.push({ duplicateId: d, canonicalId, name });
  }
  pairs.sort((a, b) => a.duplicateId - b.duplicateId);
  return { pairs, groups, skipped };
}

// DB에서 읽어 시스템 전체 대응표를 만든다(읽기 전용 쿼리만 실행).
export async function findSystemWideMergePairs(exec: SqlExecutor) {
  const items: SystemWideItem[] = ((await exec.query(`SELECT "id", "name", "type" FROM "items" ORDER BY "id"`)) ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name ?? ''), type: r.type ?? null }));
  const bomRefCounts = new Map<number, number>(
    ((await exec.query(`SELECT "materialId" AS id, COUNT(*) AS n FROM "bom_item_details" GROUP BY "materialId"`)) ?? []).map((r: any) => [Number(r.id), Number(r.n)] as [number, number]),
  );
  const others = new Set<number>(
    ((await exec.query(`SELECT "itemId" AS id FROM "purchase_order" UNION SELECT "itemId" AS id FROM "inventories" UNION SELECT "itemId" AS id FROM "work_orders"`)) ?? []).map((r: any) => Number(r.id)),
  );
  const plan = buildSystemWideMergePlan(items, bomRefCounts, others);
  // 예상 리포인트 행 수 = 삭제될 Item들의 BomItem 참조 합계(실행 후 실제 값과 대조한다)
  const expectedBomRepoints = plan.pairs.reduce((a, p) => a + (bomRefCounts.get(p.duplicateId) ?? 0), 0);
  return { ...plan, expectedBomRepoints };
}
