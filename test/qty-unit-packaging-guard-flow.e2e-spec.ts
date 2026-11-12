import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-qty-unit-packaging-guard-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MaterialPackagingUnitRule } from '../src/material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';

// PR-239: 사용자가 실사용에서 "필요수량 직접 지정"에 포장 수(46콘)를 넣으려다 단위
// 칸을 CONE으로 바꾸려 했던 사고(합성 수치로 재구성) — 단위를 콘/롤 등 길이가 아닌
// 값으로 바꾸면 포장 환산(N콘/N롤)의 전제(길이 단위)가 깨진다. 프런트 가드를 우회해
// API를 직접 호출해도 서버가 거부하는지를 실제 HTTP 요청으로 확인한다.
describe('단위 가드 — 길이 기반 요척은 길이 단위만 허용 (PR-239)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));
  const patch = (url: string) => auth(request(http()).patch(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `qty-unit-guard-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Qty Unit Guard E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    await dataSource.getRepository(MaterialPackagingUnitRule).save([
      { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
    ]);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('포장 규칙이 지정된 품목의 단위를 CONE으로 바꾸려 하면 400이고 단위가 그대로 남는다(프런트 우회 가정)', async () => {
    const item = await post('/items')
      .send({ code: `GUARD-COA-${tag}`, name: `합성자재-실류-${tag}`, type: 'RAW_MATERIAL', unit: 'M', materialSubType: 'COA_SA' })
      .expect(201);
    const itemId = item.body.data.id;

    const res = await patch(`/items/${itemId}`).send({ unit: 'CONE' }).expect(400);
    expect(res.body.message.message as string).toContain('길이 단위');

    const check = await auth(request(http()).get(`/items/${itemId}`)).expect(200);
    expect(check.body.data.unit).toBe('M'); // 거부됐으므로 단위는 바뀌지 않았어야 한다.
  });

  it('같은 품목의 단위를 길이 단위(Y)로 바꾸는 것은 허용된다', async () => {
    const item = await post('/items')
      .send({ code: `GUARD-COA2-${tag}`, name: `합성자재-실류2-${tag}`, type: 'RAW_MATERIAL', unit: 'M', materialSubType: 'COA_SA' })
      .expect(201);
    const itemId = item.body.data.id;

    const res = await patch(`/items/${itemId}`).send({ unit: 'Y' }).expect(200);
    expect(res.body.data.unit).toBe('Y');
  });

  it('포장 규칙이 없는 일반 개수 자재(단추 등)는 단위를 EA/SET/CONE 등으로 자유롭게 바꿀 수 있다', async () => {
    const item = await post('/items')
      .send({ code: `GUARD-BTN-${tag}`, name: `합성자재-단추-${tag}`, type: 'RAW_MATERIAL', unit: 'EA' })
      .expect(201);
    const itemId = item.body.data.id;

    const res = await patch(`/items/${itemId}`).send({ unit: 'SET' }).expect(200);
    expect(res.body.data.unit).toBe('SET');
  });
});
