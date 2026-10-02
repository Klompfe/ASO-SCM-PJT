import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-work-orders-by-style-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-159: 작업지시 목록 화면을 "스타일번호 목록(1단계) → 세부 작업지시(2단계)"로 개편하며
// 신설한 GET /work-orders/by-style 집계 엔드포인트 + noStyleNo/styleNoExact 필터 +
// "진행중으로 전환" 흐름(PATCH .../status에 IN_PROGRESS)의 실 서버 회귀 테스트.
describe('작업지시 스타일별 집계(GET /work-orders/by-style) + 진행중 전환 (PR-159)', () => {
  let app: INestApplication;
  let token: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));
  const patch = (url: string) => auth(request(app.getHttpServer()).patch(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `wo-by-style-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'WO By Style' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('같은 스타일번호의 작업지시 여러 건이 하나의 그룹으로 집계되고(건수/상태별 건수), 다른 스타일은 별도 그룹으로 분리된다', async () => {
    const styleNo = `PR159-STYLE-${Date.now()}`;
    const item = (await post('/items').send({ code: `PR159-ITEM-${Date.now()}`, name: 'PR159 집계 테스트 품목', type: 'FINISHED_GOOD', styleNo }).expect(201)).body.data;
    const other = (await post('/items').send({ code: `PR159-OTHER-${Date.now()}`, name: '다른 스타일 품목', type: 'FINISHED_GOOD', styleNo: `PR159-OTHER-STYLE-${Date.now()}` }).expect(201)).body.data;

    const wo1 = (await post('/work-orders').send({ itemId: item.id, targetQuantity: 10 }).expect(201)).body.data;
    const wo2 = (await post('/work-orders').send({ itemId: item.id, targetQuantity: 20 }).expect(201)).body.data;
    await post('/work-orders').send({ itemId: other.id, targetQuantity: 5 }).expect(201);
    await patch(`/work-orders/${wo2.id}/status`).send({ status: 'COMPLETED' }).expect(200);

    const res = (await get(`/work-orders/by-style?styleNo=${encodeURIComponent(styleNo)}`).expect(200)).body.data;
    expect(res.items).toHaveLength(1); // 다른 스타일은 필터로 제외됨
    const group = res.items[0];
    expect(group.styleNo).toBe(styleNo);
    expect(group.count).toBe(2);
    expect(group.statusCounts).toEqual({ PENDING: 1, COMPLETED: 1 });
    expect([wo1.id, wo2.id]).not.toContain(undefined);
  });

  it('styleNo가 없는(품목이 스타일에 연결 안 된) 작업지시는 "스타일 미지정" 그룹(styleNo:null)으로 집계된다', async () => {
    const item = (await post('/items').send({ code: `PR159-NOSTYLE-${Date.now()}`, name: '스타일 없는 품목', type: 'FINISHED_GOOD' }).expect(201)).body.data;
    await post('/work-orders').send({ itemId: item.id, targetQuantity: 1 }).expect(201);

    const res = (await get(`/work-orders/by-style?itemName=${encodeURIComponent('스타일 없는 품목')}`).expect(200)).body.data;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].styleNo).toBeNull();
  });

  it('GET /work-orders?noStyleNo=true는 styleNo가 null인 작업지시만 돌려준다', async () => {
    const item = (await post('/items').send({ code: `PR159-NULL2-${Date.now()}`, name: 'PR159 null 전용', type: 'FINISHED_GOOD' }).expect(201)).body.data;
    const wo = (await post('/work-orders').send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;

    const res = (await get('/work-orders?noStyleNo=true').expect(200)).body.data;
    expect(res.items.some((w: any) => w.id === wo.id)).toBe(true);
    expect(res.items.every((w: any) => !w.item?.styleNo)).toBe(true);
  });

  it('GET /work-orders?styleNoExact는 완전일치만 찾고, 그 스타일번호를 부분 포함하는 다른 스타일은 섞이지 않는다', async () => {
    const suffix = Date.now();
    const shortStyle = `PR159EXACT${suffix}`;
    const longStyle = `PR159EXACT${suffix}-EXTRA`; // shortStyle을 부분 포함하는 다른 스타일
    const itemShort = (await post('/items').send({ code: `PR159-SHORT-${suffix}`, name: '짧은 스타일 품목', type: 'FINISHED_GOOD', styleNo: shortStyle }).expect(201)).body.data;
    const itemLong = (await post('/items').send({ code: `PR159-LONG-${suffix}`, name: '긴 스타일 품목', type: 'FINISHED_GOOD', styleNo: longStyle }).expect(201)).body.data;
    const woShort = (await post('/work-orders').send({ itemId: itemShort.id, targetQuantity: 1 }).expect(201)).body.data;
    await post('/work-orders').send({ itemId: itemLong.id, targetQuantity: 1 }).expect(201);

    // 부분일치(styleNo)로는 둘 다 걸린다 — 완전일치 필요성의 근거.
    const partial = (await get(`/work-orders?styleNo=${encodeURIComponent(shortStyle)}`).expect(200)).body.data;
    expect(partial.items.length).toBeGreaterThanOrEqual(2);

    const exact = (await get(`/work-orders?styleNoExact=${encodeURIComponent(shortStyle)}`).expect(200)).body.data;
    expect(exact.items.map((w: any) => w.id)).toEqual([woShort.id]);
  });

  it('작업지시는 PENDING으로 시작하고, PATCH .../status로 IN_PROGRESS 전환 후 status=IN_PROGRESS 필터로 실제로 조회된다(이번 작업의 발단이 된 문제)', async () => {
    const item = (await post('/items').send({ code: `PR159-PROG-${Date.now()}`, name: 'PR159 진행중 전환 테스트', type: 'FINISHED_GOOD' }).expect(201)).body.data;
    const wo = (await post('/work-orders').send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;
    expect(wo.status).toBe('PENDING');

    await patch(`/work-orders/${wo.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);

    const res = (await get('/work-orders?status=IN_PROGRESS').expect(200)).body.data;
    expect(res.items.some((w: any) => w.id === wo.id)).toBe(true);

    const byStyle = (await get('/work-orders/by-style?status=IN_PROGRESS').expect(200)).body.data;
    expect(byStyle.items.some((g: any) => g.statusCounts.IN_PROGRESS > 0)).toBe(true);
  });

  it('완료 처리(COMPLETED)는 PENDING/IN_PROGRESS 어느 상태에서도 바로 가능하다(순서 강제 없음)', async () => {
    const item = (await post('/items').send({ code: `PR159-DIRECT-${Date.now()}`, name: 'PR159 즉시완료 테스트', type: 'FINISHED_GOOD' }).expect(201)).body.data;
    const wo = (await post('/work-orders').send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;
    const res = await patch(`/work-orders/${wo.id}/status`).send({ status: 'COMPLETED' }).expect(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('스타일(그룹) 단위로 페이지네이션되어, limit보다 스타일 수가 많으면 나머지는 다음 페이지로 넘어간다', async () => {
    const suffix = Date.now();
    const styleNos = [1, 2, 3].map((n) => `PR159-PAGE-${suffix}-${n}`);
    for (const styleNo of styleNos) {
      const item = (await post('/items').send({ code: `PR159-PAGE-ITEM-${styleNo}`, name: `PR159 페이지 테스트 ${styleNo}`, type: 'FINISHED_GOOD', styleNo }).expect(201)).body.data;
      await post('/work-orders').send({ itemId: item.id, targetQuantity: 1 }).expect(201);
    }
    const res = (await get(`/work-orders/by-style?itemName=${encodeURIComponent('PR159 페이지 테스트')}&limit=2&page=1`).expect(200)).body.data;
    expect(res.items).toHaveLength(2);
    expect(res.meta.total).toBe(3);
    expect(res.meta.totalPages).toBe(2);
  });
});
