import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-supplier-main-items-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-171: 공급업체 "주요품목" 다중 연결(Supplier<->Item ManyToMany) 회귀 테스트.
describe('공급업체 주요품목(mainItems) 다중 연결 회귀 테스트 (PR-171)', () => {
  let app: INestApplication;
  let token: string;
  let itemIdA: number;
  let itemIdB: number;
  let itemIdC: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `supplier-main-items-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Supplier Main Items E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    const makeItem = async (name: string) => {
      const res = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `MAT-SMI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, type: 'RAW_MATERIAL' })
        .expect(201);
      return res.body.data.id;
    };
    itemIdA = await makeItem('원단A');
    itemIdB = await makeItem('원단B');
    itemIdC = await makeItem('원단C');
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('mainItemIds 없이 등록하면 mainItems가 빈 배열로 저장/조회된다(기존 데이터 호환)', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '품목 없는 공급업체' })
      .expect(201);
    expect(res.body.data.mainItems).toEqual([]);

    const listRes = await request(app.getHttpServer())
      .get('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const found = listRes.body.data.find((s: any) => s.id === res.body.data.id);
    expect(found.mainItems).toEqual([]);
  });

  it('mainItemIds 1개로 등록하면 해당 품목이 연결되어 조회된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '품목 1개 공급업체', mainItemIds: [itemIdA] })
      .expect(201);
    expect(res.body.data.mainItems).toHaveLength(1);
    expect(res.body.data.mainItems[0]).toMatchObject({ id: itemIdA, name: '원단A' });

    const detail = await request(app.getHttpServer())
      .get(`/suppliers/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.mainItems).toHaveLength(1);
  });

  it('mainItemIds 여러 개로 등록하면 전부 연결된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '품목 여러개 공급업체', mainItemIds: [itemIdA, itemIdB, itemIdC] })
      .expect(201);
    expect(res.body.data.mainItems).toHaveLength(3);
    const ids = res.body.data.mainItems.map((i: any) => i.id).sort();
    expect(ids).toEqual([itemIdA, itemIdB, itemIdC].sort());
  });

  it('존재하지 않는 품목 ID로 등록하면 400이어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '잘못된 품목 공급업체', mainItemIds: [999999] })
      .expect(400);
  });

  it('수정으로 mainItemIds를 바꾸면 기존 연결이 교체된다(추가분은 생기고 빠진 품목은 사라짐)', async () => {
    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '수정 테스트 공급업체', mainItemIds: [itemIdA, itemIdB] })
      .expect(201);
    expect(created.body.data.mainItems).toHaveLength(2);

    const updated = await request(app.getHttpServer())
      .patch(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mainItemIds: [itemIdC] })
      .expect(200);
    expect(updated.body.data.mainItems).toHaveLength(1);
    expect(updated.body.data.mainItems[0].id).toBe(itemIdC);

    const detail = await request(app.getHttpServer())
      .get(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.mainItems).toHaveLength(1);
    expect(detail.body.data.mainItems[0].id).toBe(itemIdC);
  });

  it('수정 시 mainItemIds를 보내지 않으면 기존 연결이 그대로 유지된다', async () => {
    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '미지정 수정 테스트 공급업체', mainItemIds: [itemIdA] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ businessNumber: '123-45-67890' })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.mainItems).toHaveLength(1);
    expect(detail.body.data.mainItems[0].id).toBe(itemIdA);
    expect(detail.body.data.businessNumber).toBe('123-45-67890');
  });

  it('수정 시 mainItemIds를 빈 배열로 보내면 연결이 전부 해제된다', async () => {
    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '전체 해제 테스트 공급업체', mainItemIds: [itemIdA, itemIdB] })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mainItemIds: [] })
      .expect(200);
    expect(updated.body.data.mainItems).toEqual([]);
  });
});
