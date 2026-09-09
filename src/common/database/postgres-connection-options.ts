// app.module.ts(런타임 TypeOrmModule)와 data-source.ts(마이그레이션 CLI)가 같은
// Postgres 연결 옵션을 각자 따로 들고 있다가 SSL 옵션이 한쪽에만 빠지는 사고가
// 있었다(PR-060) — 두 곳 모두 이 함수 하나만 쓰도록 합쳐서 재발을 막는다.
//
// ConfigService를 쓰지 않고 process.env를 직접 읽는 이유: data-source.ts는
// Nest의 DI 컨테이너 밖에서 실행되는 순수 CLI 스크립트라 ConfigService를 쓸 수
// 없다. app.module.ts 쪽 ConfigService.get()도 결국 dotenv가 채워둔 process.env를
// 읽는 것과 동일하므로, 여기서 process.env를 직접 읽어도 두 호출부 모두 결과가 같다.
export function getPostgresConnectionOptions() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'scm_db',
    // Neon 등 관리형 Postgres는 SSL 연결을 요구한다 — DB_SSL=true일 때만 켠다
    // (docker-compose의 로컬 Postgres 서비스는 SSL을 지원하지 않으므로 기본은 off).
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}
