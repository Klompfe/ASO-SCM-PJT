import 'dotenv/config';
import { DataSource } from 'typeorm';

// TypeORM CLI 전용 DataSource — Nest의 DI/모듈 시스템 없이 마이그레이션 생성·실행에만
// 쓰인다(PR-058). 앱 자체는 app.module.ts의 TypeOrmModule.forRootAsync를 그대로 쓴다.
// 마이그레이션은 Postgres 배포를 전제로 하므로(SQLite는 로컬 개발용) type은 postgres로 고정.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'scm_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/**/*.entity.ts', 'src/**/*.entities.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
