import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-document-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-178: 발주서 다운로드 라우트. BOM에 연결된 발주는 정상 생성, 없으면 400.
describe('발주서 발행 라우트 (PR-178)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `po-doc-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Doc E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('BOM에 연결된 발주의 발주서를 base64 엑셀로 내려주고, 발주번호/공급업체가 들어 있다', async () => {
    const styleNo = `PODOC-${Date.now()}`;
    const itemName = `발주서 원단 ${Date.now()}`;
    const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '발주서 공급사' }).expect(201)).body.data.id;
    const itemId = (await auth(request(app.getHttpServer()).post('/items')).send({ code: `MAT-PODOC-${Date.now()}`, name: itemName, englishName: 'DOC FABRIC', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
    await auth(request(app.getHttpServer()).post('/mapping/commit')).send({
      styleNo,
      overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: '발주서바이어', targetRdd: '2026-12-15', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName, spec: '150cm', composition: 'WOOL 100%', hsCode: '5111', consumption: 1, requiredQty: 100 }],
    }).expect(201);
    const poId = (await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 10, unitPrice: 2.5 }).expect(201)).body.data.id;

    const res = await auth(request(app.getHttpServer()).get(`/purchase-orders/${poId}/document`)).expect(200);
    expect(res.body.data.filename).toContain(`PO${poId}`);
    const wb = xlsx.read(Buffer.from(res.body.data.base64, 'base64'), { type: 'buffer' });
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['발주서'], { header: 1, defval: '' });
    expect(rows.find((r) => r[0] === '발주번호')?.[1]).toBe(`#${poId}`);
    expect(rows.find((r) => r[0] === '공급업체')?.[1]).toBe('발주서 공급사');
    expect(rows.find((r) => r[0] === '단가')?.[1]).toBe(2.5);
  });

  it('BOM에 연결되지 않은 자재의 발주는 발주서를 만들 수 없다(400, 안내 메시지)', async () => {
    const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: '무BOM 공급사' }).expect(201)).body.data.id;
    const itemId = (await auth(request(app.getHttpServer()).post('/items')).send({ code: `MAT-NOBOMDOC-${Date.now()}`, name: '무BOM 원단', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
    const poId = (await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId, quantity: 1, unitPrice: 1 }).expect(201)).body.data.id;
    await auth(request(app.getHttpServer()).get(`/purchase-orders/${poId}/document`)).expect(400);
  });

  it('없는 발주 id는 404', async () => {
    await auth(request(app.getHttpServer()).get('/purchase-orders/999999/document')).expect(404);
  });
});
