import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-excel-overview-guard-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-252: 엑셀 개별 승인(/mapping/commit)에서 "등록돼 있고 자재 행이 없는 스타일"의 오더개요를 조용히 덮어쓰지 않는다.
// 총수량은 PR-211/212 의도된 규칙(엑셀이 기준)이라 그대로 유지. 합성 값만 사용.
describe('엑셀 승인 오더개요 가드 (PR-252)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const stamp = Date.now();
  const styleNo = `XLGUARD-${stamp}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `xl-guard-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'XL Guard E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const commit = (overviewData: Record<string, unknown>, bomItems: unknown[] = []) =>
    auth(request(app.getHttpServer()).post('/mapping/commit')).send({ styleNo, overviewData: { styleNo, ...overviewData }, bomItems });
  const overviewRow = async () =>
    (await dataSource.query(`SELECT o.* FROM style_overview o JOIN master_style s ON s.overviewId = o.id WHERE s.styleNo = ?`, [styleNo]))[0];

  it('신규 스타일: 전부 저장된다(가드 비적용)', async () => {
    const res = await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 100, shipDate: '2027-01-10' }).expect(201);
    const row = await overviewRow();
    expect(row.buyer).toBe('Buyer A');
    expect(Number(row.totalQty)).toBe(100);
    expect(res.body.data.orderOverviewConflicts).toEqual([]);
  });

  it('기존 스타일(자재 행 없음): 다른 바이어는 기존 값을 유지하고 충돌을 응답에 싣는다 — 총수량은 엑셀 값이 기준(PR-211/212)이라 그대로 갱신', async () => {
    const res = await commit({ factory: '베트남', buyer: 'Buyer B', totalQty: 250, shipDate: '2027-01-10' }).expect(201);
    const row = await overviewRow();
    expect(row.buyer).toBe('Buyer A');
    expect(Number(row.totalQty)).toBe(250);
    const conflicts = res.body.data.orderOverviewConflicts as { field: string; existing: unknown; incoming: unknown }[];
    expect(conflicts).toEqual([{ field: 'buyer', existing: 'Buyer A', incoming: 'Buyer B' }]);
    expect(res.body.data.notices).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ORDER_OVERVIEW_DIFF_KEPT' })]));
  });

  it('같은 값은 충돌 없음', async () => {
    const same = await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 250, shipDate: '2027-01-10' }).expect(201);
    expect(same.body.data.orderOverviewConflicts).toEqual([]);
  });

  it('기존 값이 비어 있는 항목(브랜드)은 채우고, 들어온 값이 비어 있으면 기존 값을 보존한다', async () => {
    const fill = await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 250, shipDate: '2027-01-10', brand: 'Brand C' }).expect(201);
    expect((await overviewRow()).brand).toBe('Brand C');
    expect(fill.body.data.orderOverviewConflicts).toEqual([]);
    await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 250, shipDate: '2027-01-10', brand: '' }).expect(201);
    expect((await overviewRow()).brand).toBe('Brand C');
    const diff = await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 250, shipDate: '2027-01-10', brand: 'Brand D' }).expect(201);
    expect((await overviewRow()).brand).toBe('Brand C');
    expect(diff.body.data.orderOverviewConflicts).toEqual([{ field: 'brand', existing: 'Brand C', incoming: 'Brand D' }]);
  });

  it('공장·CMT단가는 기존 보류 규칙 그대로(다르면 바꾸지 않고 알림)', async () => {
    const res = await commit({ factory: '삼정', buyer: 'Buyer A', totalQty: 250, shipDate: '2027-01-10' }).expect(201);
    expect((await overviewRow()).factory).toBe('베트남');
    expect(res.body.data.notices).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FACTORY_MISMATCH' })]));
  });

  it('총수량 0(못 읽음)은 기존 값을 지우지 않는다(PR-211)', async () => {
    await commit({ factory: '베트남', buyer: 'Buyer A', totalQty: 0, shipDate: '2027-01-10' }).expect(201);
    expect(Number((await overviewRow()).totalQty)).toBe(250);
  });
});
