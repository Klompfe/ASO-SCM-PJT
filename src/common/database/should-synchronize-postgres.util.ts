// FIX-1: `NODE_ENV !== 'production'`만으로 Postgres synchronize를 켰던 기존 로직은
// `.env`가 운영(원격) DB를 가리킨 채 NODE_ENV=production을 빼먹고 서버/스크립트를
// 실행하면 그 실행 당시 엔티티에 없는 컬럼을 운영 DB에서 조용히 지워버리는 사고를
// 낳았다(purchase_order.orderType, export_shipment_lines.materialSubType/priceBasisNote
// 두 번 발생). NODE_ENV 값과 무관하게, "로컬 Postgres 호스트 + 명시적 옵트인"일 때만
// synchronize를 켜도록 바꾼다.
const LOCAL_POSTGRES_HOSTS = ['localhost', '127.0.0.1', 'postgres'];

export class RemoteSynchronizeError extends Error {
  constructor() {
    super('원격 DB에서는 synchronize를 켤 수 없습니다. 마이그레이션을 사용하세요.');
    this.name = 'RemoteSynchronizeError';
  }
}

// dbSynchronize: 환경변수 DB_SYNCHRONIZE 값 그대로("true"일 때만 켜짐 의도, 그 외는 전부 꺼짐).
// dbHost: 환경변수 DB_HOST 값 그대로.
export function shouldSynchronizePostgres(opts: { dbSynchronize?: string | null; dbHost?: string | null }): boolean {
  const enabled = opts.dbSynchronize === 'true';
  if (!enabled) return false;

  const host = (opts.dbHost ?? '').trim().toLowerCase();
  const isLocal = LOCAL_POSTGRES_HOSTS.includes(host);
  if (!isLocal) {
    // 서버가 뜨지 않도록 던진다 — 원격 DB에서 synchronize가 조용히 켜진 채 넘어가는
    // 것이 바로 이번 사고의 원인이었다.
    throw new RemoteSynchronizeError();
  }
  return true;
}
