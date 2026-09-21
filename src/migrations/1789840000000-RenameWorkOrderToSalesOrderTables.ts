import { DefaultNamingStrategy, MigrationInterface, QueryRunner } from 'typeorm';

// PR-133: "작업지시" 용어 정리. 고객사로부터 받은 주문(작업지시서 업로드로 등록)은 "수주"로 부르기로 해서, 그 흐름이 만드는 작업명세
// 테이블/컬럼 이름을 바꾼다(WorkOrderSpec → SalesOrderSpec, WorkOrderSizeSpecRow → SalesOrderSizeSpecRow).
//
// ★ 데이터 보존이 최우선이라 DROP+CREATE가 아니라 RENAME만 쓴다(운영 DB에 실데이터가 있다). 행/ID/값은 하나도 바뀌지 않는다.
//
// 테이블만 RENAME하면 Postgres에서 PK/FK 제약 이름(옛 테이블 이름의 해시)과 시퀀스 이름이 옛 이름으로 남는다. 동작에는 지장이 없지만,
// 다음 `migration:generate`가 "제약을 지웠다 다시 만드는" 불필요한 변경을 만들어 내므로(스키마 드리프트), TypeORM이 새 테이블 이름으로
// 계산하는 이름(DefaultNamingStrategy)으로 함께 맞춰 둔다. 이 부분은 Postgres 전용이라 SQLite(로컬/테스트)에서는 건너뛴다.
export const TABLE_RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'work_order_spec', to: 'sales_order_spec' },
  { from: 'work_order_size_spec_row', to: 'sales_order_size_spec_row' },
];
export const COLUMN_RENAME = { table: 'contract', from: 'triggeredByWorkOrderSpecId', to: 'triggeredBySalesOrderSpecId' } as const;

const isPostgres = (qr: QueryRunner): boolean => (qr as any)?.connection?.options?.type === 'postgres';

// direction 방향으로 테이블 이름을 이미 바꾼 뒤(cur = 지금 이름, prev = 바꾸기 전 이름), 딸린 시퀀스/제약 이름을 TypeORM 관례에 맞춘다.
async function alignPostgresObjectNames(qr: QueryRunner, cur: string, prev: string): Promise<void> {
  const naming = new DefaultNamingStrategy();

  // 1) id 시퀀스: work_order_spec_id_seq → sales_order_spec_id_seq (컬럼 기본값은 OID로 연결돼 있어 이름을 바꿔도 그대로 동작한다)
  const seqRows: Array<{ seq: string | null }> = await qr.query(`SELECT pg_get_serial_sequence('"${cur}"', 'id') AS seq`);
  const currentSeq = seqRows?.[0]?.seq ? String(seqRows[0].seq).split('.').pop()!.replace(/"/g, '') : null;
  const desiredSeq = `${cur}_id_seq`;
  if (currentSeq && currentSeq !== desiredSeq) {
    await qr.query(`ALTER SEQUENCE "${currentSeq}" RENAME TO "${desiredSeq}"`);
  }

  // 2) 제약: PK/FK는 TypeORM이 계산하는 이름으로, NOT NULL 제약(PG 18+는 이름 있는 제약으로 저장)은 테이블 이름 접두사만 교체
  // 주의: attname은 name 타입이라 array_agg(attname)을 그대로 두면 pg 드라이버가 배열이 아니라 문자열("{id}")로 돌려줘 이름 해시가 틀어진다
  // (운영 DB 리허설에서 발견). ::text로 캐스팅해 text[]로 받는다.
  const constraints: Array<{ conname: string; contype: string; cols: string[] }> = await qr.query(
    `SELECT c.conname AS conname, c.contype AS contype,
            COALESCE(array_agg(a.attname::text ORDER BY a.attnum) FILTER (WHERE a.attname IS NOT NULL), ARRAY[]::text[]) AS cols
       FROM pg_constraint c
       LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = '"${cur}"'::regclass
      GROUP BY c.conname, c.contype
      ORDER BY c.conname`,
  );
  for (const c of constraints ?? []) {
    let desired: string | null = null;
    if (c.contype === 'p') desired = naming.primaryKeyName(cur, c.cols);
    else if (c.contype === 'f') desired = naming.foreignKeyName(cur, c.cols);
    else if (c.contype === 'n' && c.conname.startsWith(`${prev}_`)) desired = `${cur}_${c.conname.slice(prev.length + 1)}`;
    if (desired && desired !== c.conname) {
      await qr.query(`ALTER TABLE "${cur}" RENAME CONSTRAINT "${c.conname}" TO "${desired}"`);
    }
  }
}

export class RenameWorkOrderToSalesOrderTables1789840000000 implements MigrationInterface {
  name = 'RenameWorkOrderToSalesOrderTables1789840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLE_RENAMES) {
      await queryRunner.query(`ALTER TABLE "${t.from}" RENAME TO "${t.to}"`);
    }
    await queryRunner.query(`ALTER TABLE "${COLUMN_RENAME.table}" RENAME COLUMN "${COLUMN_RENAME.from}" TO "${COLUMN_RENAME.to}"`);
    if (isPostgres(queryRunner)) {
      for (const t of TABLE_RENAMES) await alignPostgresObjectNames(queryRunner, t.to, t.from);
    }
  }

  // 역순으로 원래 이름(과 TypeORM이 원래 계산했던 제약/시퀀스 이름)으로 되돌린다.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${COLUMN_RENAME.table}" RENAME COLUMN "${COLUMN_RENAME.to}" TO "${COLUMN_RENAME.from}"`);
    for (const t of [...TABLE_RENAMES].reverse()) {
      await queryRunner.query(`ALTER TABLE "${t.to}" RENAME TO "${t.from}"`);
    }
    if (isPostgres(queryRunner)) {
      for (const t of TABLE_RENAMES) await alignPostgresObjectNames(queryRunner, t.from, t.to);
    }
  }
}
