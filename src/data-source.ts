import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { getPostgresConnectionOptions } from './common/database/postgres-connection-options';

// TypeORM CLI 전용 DataSource — Nest의 DI/모듈 시스템 없이 마이그레이션 생성·실행에만
// 쓰인다(PR-058). 앱 자체는 app.module.ts의 TypeOrmModule.forRootAsync를 그대로 쓴다.
// 마이그레이션은 Postgres 배포를 전제로 하므로(SQLite는 로컬 개발용) type은 postgres로 고정.
// 연결 옵션(host/port/ssl 등)은 app.module.ts와 동일한 getPostgresConnectionOptions()를
// 공유한다 — 각자 따로 들고 있다가 SSL 옵션이 한쪽에만 빠지는 사고가 있었다(PR-060).
//
// __dirname 기준 상대 경로를 쓰는 이유(PR-059): 로컬 개발에서는 ts-node로 이 파일을
// src/data-source.ts 그대로 실행하고(__dirname=src, *.ts 컴파일), 프로덕션 컨테이너에서는
// devDependencies(ts-node/typescript) 없이 nest build가 만든 dist/data-source.js를 그대로
// node로 실행한다(__dirname=dist, *.js). 확장자를 {ts,js}로 함께 매칭해 두 경우 모두 동작한다.
export const AppDataSource = new DataSource({
  type: 'postgres',
  ...getPostgresConnectionOptions(),
  entities: [
    join(__dirname, '**/*.entity.{ts,js}'),
    join(__dirname, '**/*.entities.{ts,js}'),
  ],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
});
