import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-sales-orders-routes-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;
// .env에는 실제 Gemini 키가 있다 — 테스트가 유료 API를 호출하지 않도록 빈 값으로 고정한다(process.env에 이미 정의된 값은 .env가 덮어쓰지 않는다).
process.env.GEMINI_API_KEY = '';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Contract, ContractStatus } from '../src/styles/entities/contract.entity';

// PR-133: 수주(작업지시서 업로드) 흐름을 /work-orders/* 에서 /sales-orders/* 로 분리했다. 새 경로는 예전과 똑같이 동작하고,
// 예전 경로는 사라졌으며, 내부 생산 지시(/work-orders) 나머지 라우트는 그대로 동작해야 한다.
describe('수주 모듈 분리: /sales-orders/* 와 /work-orders/* (PR-133)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));
  const patch = (url: string) => auth(request(app.getHttpServer()).patch(url));
  const del = (url: string) => auth(request(app.getHttpServer()).delete(url));
  const rawCount = async (table: string) => Number((await dataSource.query(`SELECT count(*) AS n FROM "${table}"`))[0].n);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `sales-orders-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Sales Orders' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const STYLE = `SO-STYLE-${Date.now()}`;

  describe('새 경로 /sales-orders/*', () => {
    let specId: number;

    it('전제: 테스트에서는 Gemini 키가 비어 있어 실제 API를 호출하지 않는다', () => {
      expect(process.env.GEMINI_API_KEY).toBe('');
    });

    // 파일 검증(FileTypeValidator)은 Nest 10.4가 `eval('import("file-type")')`로 파일 시그니처를 확인하는데, Jest의 VM에서는 그 동적 import가
    // 실패해 유효한 PNG도 400이 된다(일반 Node에서는 통과 — 별도로 확인함). 그래서 여기서는 "새 경로에 라우트가 있고 검증이 동작한다"까지만 본다.
    // 실제 분석(목업 응답/과금 로그)은 SalesOrdersService 유닛 테스트와 vision 유닛 테스트가, 실제 업로드는 운영 DB 검증이 확인한다.
    it('POST /sales-orders/upload-image: 라우트가 새 경로에 있다(파일 없이 보내면 404가 아니라 400), 지원하지 않는 형식도 400', async () => {
      await post('/sales-orders/upload-image').expect(400);
      await post('/sales-orders/upload-image').attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
    });

    it('GET /sales-orders/ai-usage, /ai-usage/summary: 내 사용량 이력/요약', async () => {
      expect((await get('/sales-orders/ai-usage').expect(200)).body.data).toEqual([]);
      expect((await get('/sales-orders/ai-usage/summary').expect(200)).body.data).toMatchObject({ totalCalls: 0, totalChargedKrw: 0 });
    });

    it('POST /sales-orders/commit-analysis: 오더개요+자재명세+작업명세가 저장되고 계약(승인 대기)이 생기며, 계약은 방금 만든 작업명세의 ID를 triggeredBySalesOrderSpecId로 가진다', async () => {
      const res = (
        await post('/sales-orders/commit-analysis')
          .send({
            overview: { styleNo: STYLE, styleName: null, itemType: 'JK', brand: null, productionType: null, factory: '베트남', buyer: 'SO Buyer', totalQty: 300, targetRdd: null },
            bomItems: [{ category: 'FABRIC', itemName: `SO-원단-${Date.now()}`, spec: null, colorCode: 'BK', consumption: 1.5, requiredQty: 450, supplier: null, remarks: null }],
            sizeSpecs: [
              { part: '화장', size: '0', instructedValue: '58', sampleValue: '58.5', diffValue: '+0.5', finalValue: '58.5' },
              { part: '총기장', size: '0', instructedValue: '70', sampleValue: null, diffValue: null, finalValue: null },
            ],
            workNotes: '소매 봉제 주의',
          })
          .expect(201)
      ).body.data;
      specId = res.id;
      expect(res).toMatchObject({ styleNo: STYLE, workNotes: '소매 봉제 주의' });
      expect(Array.isArray(res.warnings)).toBe(true);
      expect(res.sizeSpecs).toHaveLength(2);

      // 실제 테이블 이름이 sales_order_spec / sales_order_size_spec_row 다
      expect(await rawCount('sales_order_spec')).toBe(1);
      expect(await rawCount('sales_order_size_spec_row')).toBe(2);
      const rows = await dataSource.query(`SELECT "specId" FROM "sales_order_size_spec_row"`);
      expect(rows.every((r: any) => r.specId === specId)).toBe(true);

      const contract = await dataSource.getRepository(Contract).findOneOrFail({ where: { styleNo: STYLE } });
      expect(contract.status).toBe(ContractStatus.PENDING_APPROVAL);
      expect(contract.triggeredBySalesOrderSpecId).toBe(specId);
    });

    it('POST /sales-orders/commit-analysis: Style No가 없으면 400', async () => {
      await post('/sales-orders/commit-analysis')
        .send({ overview: { styleNo: '', factory: 'x', buyer: 'y', totalQty: 1 }, bomItems: [], sizeSpecs: [], workNotes: null })
        .expect(400);
    });

    it('GET /sales-orders/spec?styleNo=: 스타일별 작업명세(사이즈 스펙 포함), styleNo가 없으면 400', async () => {
      const list = (await get(`/sales-orders/spec?styleNo=${STYLE}`).expect(200)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: specId, styleNo: STYLE });
      expect(list[0].sizeSpecs.map((r: any) => r.part).sort()).toEqual(['총기장', '화장']);
      await get('/sales-orders/spec').expect(400);
      expect((await get('/sales-orders/spec?styleNo=NOPE').expect(200)).body.data).toEqual([]);
    });
  });

  describe('예전 경로 /work-orders/* 의 수주 라우트는 사라졌다', () => {
    it('POST /work-orders/commit-analysis, /upload-image → 404', async () => {
      await post('/work-orders/commit-analysis').send({}).expect(404);
      await post('/work-orders/upload-image').expect(404);
    });
    it('GET /work-orders/spec, /ai-usage, /ai-usage/summary는 이제 :id 라우트로 해석되어 400(숫자가 아님)', async () => {
      await get('/work-orders/spec?styleNo=X').expect(400);
      await get('/work-orders/ai-usage').expect(400);
    });
  });

  describe('내부 생산 지시 /work-orders/* 나머지 라우트는 그대로 동작한다(회귀 없음)', () => {
    let itemId: number;
    let woId: number;

    it('POST /work-orders → 201, GET /work-orders 목록/페이지 meta, GET /work-orders/:id', async () => {
      itemId = (await post('/items').send({ code: `SO-ITEM-${Date.now()}`, name: '생산 품목', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      woId = (await post('/work-orders').send({ itemId, targetQuantity: 12 }).expect(201)).body.data.id;
      const list = (await get('/work-orders?page=1&limit=10').expect(200)).body.data;
      expect(list.meta.total).toBe(1);
      expect(list.items[0]).toMatchObject({ id: woId, status: 'PENDING' });
      expect((await get(`/work-orders/${woId}`).expect(200)).body.data).toMatchObject({ id: woId, targetQuantity: 12 });
    });

    it('GET /work-orders/:id/material-requirements, GET /work-orders/style-requirements(그대로 work-orders 아래)', async () => {
      expect((await get(`/work-orders/${woId}/material-requirements`).expect(200)).body.data.workOrder.id).toBe(woId);
      const sr = (await get(`/work-orders/style-requirements?styleNo=${STYLE}&quantity=100`).expect(200)).body.data;
      expect(sr).toMatchObject({ styleNo: STYLE, quantity: 100, styleExists: true });
      await get('/work-orders/style-requirements').expect(400);
    });

    it('PATCH /work-orders/:id/status, DELETE /work-orders/:id', async () => {
      expect((await patch(`/work-orders/${woId}/status`).send({ status: 'IN_PROGRESS' }).expect(200)).body.data.status).toBe('IN_PROGRESS');
      await del(`/work-orders/${woId}`).expect(200);
      await get(`/work-orders/${woId}`).expect(404);
    });
  });
});
