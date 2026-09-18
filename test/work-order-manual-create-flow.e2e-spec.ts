import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-work-order-manual-create-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-105: 화면에 이미지 업로드 경로만 있고 POST /work-orders(직접 입력 등록)를 호출하는
// 곳이 없었던 문제를 프론트에서 연결했다 — 백엔드 엔드포인트 자체가 실제로 정상 동작하고
// 목록 조회에 반영되는지, 그리고 존재하지 않는 품목이면 404가 나는지 HTTP 레벨로 확인한다.
describe('작업지시 직접 입력 등록 (PR-105)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `wo-manual-create-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'WO Manual Create E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const ts = Date.now();
  let itemId: number;
  let workOrderId: number;

  it('사전 준비: 품목을 하나 생성한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `WO-MANUAL-${ts}`, name: `수동등록 테스트 품목 ${ts}`, type: 'RAW_MATERIAL' })
      .expect(201);
    itemId = res.body.data.id;
  });

  it('품목ID와 목표수량으로 작업지시를 생성하면 PENDING 상태로 저장된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId, targetQuantity: 7 })
      .expect(201);

    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.targetQuantity).toBe(7);
    workOrderId = res.body.data.id;
  });

  it('목록 조회 시 방금 생성한 작업지시가 포함된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/work-orders')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const items = Array.isArray(res.body.data) ? res.body.data : res.body.data.items;
    const found = items.find((wo: any) => wo.id === workOrderId);
    expect(found).toBeDefined();
    expect(found.itemId).toBe(itemId);
  });

  it('존재하지 않는 itemId로 생성하면 404가 반환된다', async () => {
    await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 987654321, targetQuantity: 1 })
      .expect(404);
  });

  it('targetQuantity가 0 이하면 400이 반환된다', async () => {
    await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId, targetQuantity: 0 })
      .expect(400);
  });
});
