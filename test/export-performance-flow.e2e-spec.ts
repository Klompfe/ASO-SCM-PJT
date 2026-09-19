import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-export-performance-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ExportShipment } from '../src/export-shipments/entities/export-shipment.entity';
import { ExportShipmentLine } from '../src/export-shipments/entities/export-shipment-line.entity';

// PR-119: GET /export-shipments/performance — FINALIZED만, invoiceDate 기간(양끝 포함),
// 라인 단위 브랜드 분류(BrandPrefixRule 마스터), 미확정 제외 건수.
describe('수출 실적표 조회 (PR-119)', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const perf = async (q = '') => (await auth(request(app.getHttpServer()).get(`/export-shipments/performance${q}`)).expect(200)).body.data;

  const seed = async (status: string, invoiceDate: string | null, sheetNo: string, lines: [string, number, string, number | null][]) => {
    const shipment = await dataSource.getRepository(ExportShipment).save(
      dataSource.getRepository(ExportShipment).create({ status: status as any, invoiceDate: invoiceDate as any, sheetNo, styleNos: lines.map((l) => l[0]) }),
    );
    await dataSource.getRepository(ExportShipmentLine).save(
      lines.map(([styleNo, qty, unit, amount]) =>
        dataSource.getRepository(ExportShipmentLine).create({ exportShipmentId: shipment.id, styleNo, description: 'D', qty, unit, amount }),
      ),
    );
    return shipment.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `export-perf-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Perf E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    await auth(request(app.getHttpServer()).post('/brand-prefix-rules')).send({ prefix: 'BF', brandName: '빈폴' }).expect(201);
    await auth(request(app.getHttpServer()).post('/brand-prefix-rules')).send({ prefix: 'LB', brandName: '라베' }).expect(201);

    await seed('FINALIZED', '2031-09-10', 'P-A', [['BF1', 100, 'YD', 1000], ['LB1', 10, 'EA', 30]]);
    await seed('FINALIZED', '2031-09-30', 'P-B', [['BF2', 20, 'EA', null], ['ZZ9', 5, 'EA', 15]]);
    await seed('FINALIZED', '2031-10-05', 'P-C', [['BF3', 999, 'YD', 9999]]);
    await seed('DRAFT', '2031-09-15', 'P-D', [['BF4', 1000, 'YD', 10000]]);
    await seed('REVIEWED', '2031-09-16', 'P-E', [['BF5', 2000, 'YD', 20000]]);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('FINALIZED만 집계하고, 같은 기간의 미확정(DRAFT/REVIEWED) 수는 제외 건수로 알려준다', async () => {
    const r = await perf('?from=2031-09-01&to=2031-09-30');
    expect(r.shipments.map((s: any) => s.sheetNo)).toEqual(['P-A', 'P-B']);
    expect(r.excludedNotFinalized).toBe(2);
    expect(r.totals).toEqual({ shipmentCount: 2, lineCount: 4, qtyByUnit: { YD: 100, EA: 35 }, amount: 1045, linesWithoutAmount: 1 });
  });

  it('기간은 양끝 포함, 한쪽만 지정 가능, 형식 오류는 400, 기간 없으면 전체 확정 건', async () => {
    expect((await perf('?from=2031-09-10&to=2031-09-10')).shipments.map((s: any) => s.sheetNo)).toEqual(['P-A']);
    expect((await perf('?from=2031-09-30')).shipments.map((s: any) => s.sheetNo)).toEqual(['P-B', 'P-C']);
    expect((await perf('?to=2031-09-09')).shipments).toEqual([]);
    expect((await perf()).shipments.map((s: any) => s.sheetNo)).toEqual(['P-A', 'P-B', 'P-C']);
    await auth(request(app.getHttpServer()).get('/export-shipments/performance?from=bad')).expect(400);
  });

  it('브랜드는 라인 단위로 분류되어 한 문서에 섞인 브랜드가 각자 집계된다(미분류 포함)', async () => {
    const r = await perf('?from=2031-09-01&to=2031-09-30');
    expect(r.byBrand).toEqual([
      { brand: '빈폴', shipmentCount: 2, lineCount: 2, qtyByUnit: { YD: 100, EA: 20 }, amount: 1000 },
      { brand: '라베', shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 10 }, amount: 30 },
      { brand: '미분류', shipmentCount: 1, lineCount: 1, qtyByUnit: { EA: 5 }, amount: 15 },
    ]);
    expect(r.shipments[0].brands).toEqual(['라베', '빈폴']);
  });

  it('/export-shipments/performance가 :id 라우트로 해석되지 않는다(기존 :id 조회는 그대로)', async () => {
    await auth(request(app.getHttpServer()).get('/export-shipments/999999')).expect(404);
  });
});
