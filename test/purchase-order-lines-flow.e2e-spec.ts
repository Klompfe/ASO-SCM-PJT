import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-purchase-order-lines-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-176: 발주 색상/사이즈별 라인. 라인이 있으면 총수량 = 라인 합계, 없으면 기존 quantity 방식.
describe('발주 색상/사이즈 라인 회귀 테스트 (PR-176)', () => {
  let app: INestApplication;
  let token: string;
  let supplierId: number;
  let itemId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `po-lines-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'PO Lines E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    supplierId = (await request(app.getHttpServer()).post('/suppliers').set('Authorization', `Bearer ${token}`)
      .send({ name: 'PO Lines Supplier' }).expect(201)).body.data.id;
    itemId = (await request(app.getHttpServer()).post('/items').set('Authorization', `Bearer ${token}`)
      .send({ code: `MAT-POLINES-${Date.now()}`, name: '라인 테스트 원단', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  it('라인 여러 개를 보내면 총수량이 라인 합계가 되고 상세 조회에 라인이 함께 나온다', async () => {
    const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId, unitPrice: 5, quantity: 30,
      lines: [{ color: 'BLACK', size: 'M', qty: 10 }, { color: 'BLACK', size: 'L', qty: 5 }, { color: 'WHITE', size: 'M', qty: 15 }],
    }).expect(201);
    expect(created.body.data.quantity).toBe(30);
    expect(created.body.data.warnings).toEqual([]);

    const detail = await auth(request(app.getHttpServer()).get(`/purchase-orders/${created.body.data.id}`)).expect(200);
    expect(detail.body.data.lines).toHaveLength(3);
    expect(detail.body.data.lines.reduce((s: number, l: any) => s + l.qty, 0)).toBe(30);
  });

  it('입력한 총수량이 라인 합계와 다르면 라인 합계로 저장하고 경고를 응답에 담는다', async () => {
    const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId, unitPrice: 5, quantity: 99,
      lines: [{ color: 'RED', size: 'S', qty: 7 }, { color: 'RED', size: 'M', qty: 8 }],
    }).expect(201);
    expect(created.body.data.quantity).toBe(15);
    expect(created.body.data.warnings[0]).toContain('라인 합계');
  });

  it('라인 없이 quantity만 보내는 기존 방식은 그대로 동작하고 라인은 빈 배열이다(하위호환)', async () => {
    const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId, unitPrice: 5, quantity: 42,
    }).expect(201);
    expect(created.body.data.quantity).toBe(42);

    const detail = await auth(request(app.getHttpServer()).get(`/purchase-orders/${created.body.data.id}`)).expect(200);
    expect(detail.body.data.lines).toEqual([]);
  });

  it('라인도 quantity도 없으면 400', async () => {
    await auth(request(app.getHttpServer()).post('/purchase-orders')).send({ supplierId, itemId, unitPrice: 5 }).expect(400);
  });

  it('목록 조회에서도 라인이 있는 발주는 라인을, 없는 발주는 빈 배열을 돌려준다', async () => {
    const list = await auth(request(app.getHttpServer()).get('/purchase-orders')).expect(200);
    const withLines = list.body.data.filter((po: any) => po.lines && po.lines.length > 0);
    const withoutLines = list.body.data.filter((po: any) => po.lines && po.lines.length === 0);
    expect(withLines.length).toBeGreaterThan(0);
    expect(withoutLines.length).toBeGreaterThan(0);
  });

  // MERGE-3(PR-176×177): "수정하기"로 줄을 바꿀 수 있어야 한다.
  describe('수정하기(PATCH)로 색상/사이즈 라인 바꾸기 (PR-177 통합)', () => {
    it('기존 라인을 다른 라인으로 전체 교체하면 총수량도 새 합계로 바뀐다', async () => {
      const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
        supplierId, itemId, unitPrice: 5, quantity: 10,
        lines: [{ color: 'BLACK', qty: 10 }],
      }).expect(201);

      const updated = await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}`)).send({
        lines: [{ color: 'BLACK', qty: 4 }, { color: 'WHITE', qty: 6 }],
      }).expect(200);
      expect(updated.body.data.quantity).toBe(10);
      expect(updated.body.data.warnings).toEqual([]);

      const detail = await auth(request(app.getHttpServer()).get(`/purchase-orders/${created.body.data.id}`)).expect(200);
      expect(detail.body.data.lines).toHaveLength(2);
      expect(detail.body.data.lines.map((l: any) => l.color).sort()).toEqual(['BLACK', 'WHITE']);
    });

    it('라인 없는 발주에 처음으로 라인을 추가하면 총수량이 라인 합계로 바뀐다', async () => {
      const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
        supplierId, itemId, unitPrice: 5, quantity: 20,
      }).expect(201);

      const updated = await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}`)).send({
        lines: [{ color: 'NAVY', qty: 12 }, { color: 'NAVY', size: 'L', qty: 8 }],
      }).expect(200);
      expect(updated.body.data.quantity).toBe(20);

      const detail = await auth(request(app.getHttpServer()).get(`/purchase-orders/${created.body.data.id}`)).expect(200);
      expect(detail.body.data.lines).toHaveLength(2);
    });

    it('라인이 있는 발주에서 lines를 빈 배열로 보내면 라인이 전부 지워진다', async () => {
      const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
        supplierId, itemId, unitPrice: 5, quantity: 15,
        lines: [{ color: 'GREY', qty: 15 }],
      }).expect(201);

      await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}`)).send({
        quantity: 25, lines: [],
      }).expect(200);

      const detail = await auth(request(app.getHttpServer()).get(`/purchase-orders/${created.body.data.id}`)).expect(200);
      expect(detail.body.data.lines).toEqual([]);
      expect(detail.body.data.quantity).toBe(25);
    });

    it('미입고(PENDING)가 아닌 발주는 라인을 포함해도 여전히 수정할 수 없다', async () => {
      const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
        supplierId, itemId, unitPrice: 5, quantity: 5, lines: [{ color: 'BLACK', qty: 5 }],
      }).expect(201);
      await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}/status`)).send({ status: 'RECEIVED' }).expect(200);

      await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}`)).send({
        lines: [{ color: 'WHITE', qty: 9 }],
      }).expect(400);
    });
  });

  // MERGE-3 D: 단가 없는 CMT 발주 + 색상/사이즈 줄 + 발주 구분(가발주)의 조합.
  it('단가 없는 CMT 발주 + 색상/사이즈 줄 + 가발주 구분을 함께 생성/수정할 수 있다', async () => {
    const created = await auth(request(app.getHttpServer()).post('/purchase-orders')).send({
      supplierId, itemId, quantity: 20, orderType: 'PROVISIONAL',
      lines: [{ color: 'BEIGE', qty: 12 }, { color: 'BEIGE', size: 'L', qty: 8 }],
    }).expect(201);
    expect(created.body.data.unitPrice).toBeNull();
    expect(created.body.data.orderType).toBe('PROVISIONAL');
    expect(created.body.data.quantity).toBe(20);

    const updated = await auth(request(app.getHttpServer()).patch(`/purchase-orders/${created.body.data.id}`)).send({
      lines: [{ color: 'BEIGE', qty: 20 }],
    }).expect(200);
    expect(updated.body.data.quantity).toBe(20);
    expect(updated.body.data.unitPrice).toBeNull(); // unitPrice를 안 보냈으니 그대로 null 유지
  });
});
