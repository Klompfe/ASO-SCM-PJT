import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-item-thread-tape-classification-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User, UserRole } from '../src/users/entities/user.entity';
import { MaterialPackagingUnitRule } from '../src/material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';

// PR-186 D: GET /items/thread-tape-candidates(보수적 추출 + 추천, 자동 확정 아님) ·
// POST /items/thread-tape-classification(사람이 확인 후 일괄 적용, all-or-nothing).
describe('실/테이프 종류 후보 조회 · 일괄 지정 (PR-186 D)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  // PR-186-FIX: 일괄 지정(classify)은 MANAGER/ADMIN만 허용 — USER 토큰으로 403을 확인한다.
  let userToken: string;
  const tag = Date.now();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const authAsUser = (r: request.Test) => r.set('Authorization', `Bearer ${userToken}`);
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `thread-tape-e2e-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'ThreadTape E2E' });
    await dataSource.getRepository(User).update({ email }, { role: UserRole.MANAGER });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    const userEmail = `thread-tape-user-e2e-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email: userEmail, password: 'password123!', name: 'ThreadTape User E2E' });
    userToken = (await request(http()).post('/auth/login').send({ email: userEmail, password: 'password123!' }).expect(201)).body.data.accessToken;

    await dataSource.getRepository(MaterialPackagingUnitRule).save([
      { materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
      { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
    ]);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('실/테이프로 보이는 자재만 후보로 나오고, 정확히 1개 규칙에 매칭되면 추천이 채워진다', async () => {
    const thread = await auth(request(http()).post('/items')).send({ code: `TT-COA-${tag}`, name: `코아사 45S/2H ${tag}`, type: 'RAW_MATERIAL' }).expect(201);
    const plain = await auth(request(http()).post('/items')).send({ code: `TT-PLAIN-${tag}`, name: `일반 원단 ${tag}`, type: 'RAW_MATERIAL' }).expect(201);

    const res = await auth(request(http()).get('/items/thread-tape-candidates').query({ reviewed: 'false' })).expect(200);
    const ids = res.body.data.map((c: any) => c.id);
    expect(ids).toContain(thread.body.data.id);
    expect(ids).not.toContain(plain.body.data.id);

    const candidate = res.body.data.find((c: any) => c.id === thread.body.data.id);
    expect(candidate.suggestion).toMatchObject({ materialSubType: 'COA_SA' });
  });

  it('존재하지 않는 itemId나 규칙에 없는 종류가 섞이면 전부 거절(일부만 적용되지 않는다)', async () => {
    const a = await auth(request(http()).post('/items')).send({ code: `TT-A-${tag}`, name: `코아사 ${tag}A`, type: 'RAW_MATERIAL' }).expect(201);
    const b = await auth(request(http()).post('/items')).send({ code: `TT-B-${tag}`, name: `다데 테이프 ${tag}B`, type: 'RAW_MATERIAL' }).expect(201);

    await auth(request(http()).post('/items/thread-tape-classification')).send({
      assignments: [
        { itemId: a.body.data.id, materialSubType: 'COA_SA' },
        { itemId: 9999999, materialSubType: 'COA_SA' },
      ],
    }).expect(400);
    const unchangedA = await auth(request(http()).get(`/items/${a.body.data.id}`)).expect(200);
    expect(unchangedA.body.data.materialSubType ?? null).toBeNull();

    await auth(request(http()).post('/items/thread-tape-classification')).send({
      assignments: [{ itemId: b.body.data.id, materialSubType: 'NOT_A_REAL_SUBTYPE' }],
    }).expect(400);
  });

  it('모두 유효하면 일괄 적용되고, 적용된 품목은 더 이상 reviewed=false 후보에 나오지 않는다', async () => {
    const thread = await auth(request(http()).post('/items')).send({ code: `TT-C-${tag}`, name: `다데 테이프 ${tag}C`, type: 'RAW_MATERIAL' }).expect(201);
    const notThread = await auth(request(http()).post('/items')).send({ code: `TT-D-${tag}`, name: `코아사 ${tag}D`, type: 'RAW_MATERIAL' }).expect(201);

    const applied = await auth(request(http()).post('/items/thread-tape-classification')).send({
      assignments: [
        { itemId: thread.body.data.id, materialSubType: 'DADE' },
        { itemId: notThread.body.data.id, materialSubType: null }, // "실/테이프 아님"으로 확정
      ],
    }).expect(201);
    expect(applied.body.data).toEqual({ updated: 2 });

    const updatedThread = await auth(request(http()).get(`/items/${thread.body.data.id}`)).expect(200);
    expect(updatedThread.body.data.materialSubType).toBe('DADE');
    expect(updatedThread.body.data.packagingReviewedAt).toBeTruthy();

    const updatedNotThread = await auth(request(http()).get(`/items/${notThread.body.data.id}`)).expect(200);
    expect(updatedNotThread.body.data.materialSubType ?? null).toBeNull();
    expect(updatedNotThread.body.data.packagingReviewedAt).toBeTruthy();

    const remainingUnreviewed = await auth(request(http()).get('/items/thread-tape-candidates').query({ reviewed: 'false' })).expect(200);
    const remainingIds = remainingUnreviewed.body.data.map((c: any) => c.id);
    expect(remainingIds).not.toContain(thread.body.data.id);
    expect(remainingIds).not.toContain(notThread.body.data.id);

    const reviewedList = await auth(request(http()).get('/items/thread-tape-candidates').query({ reviewed: 'true' })).expect(200);
    expect(reviewedList.body.data.map((c: any) => c.id)).toContain(thread.body.data.id);
  });

  it('빈 assignments는 400이다', async () => {
    await auth(request(http()).post('/items/thread-tape-classification')).send({ assignments: [] }).expect(400);
  });

  // PR-186-FIX: 일괄 지정은 소요량/발주/INVOICE 환산에 직접 영향을 주므로 MANAGER/ADMIN만 허용.
  describe('권한 제한 (PR-186-FIX)', () => {
    it('USER 토큰으로는 403이고 적용되지 않는다', async () => {
      const item = await auth(request(http()).post('/items')).send({ code: `TT-PERM-${tag}`, name: `코아사 ${tag}PERM`, type: 'RAW_MATERIAL' }).expect(201);

      await authAsUser(request(http()).post('/items/thread-tape-classification')).send({
        assignments: [{ itemId: item.body.data.id, materialSubType: 'COA_SA' }],
      }).expect(403);

      const unchanged = await auth(request(http()).get(`/items/${item.body.data.id}`)).expect(200);
      expect(unchanged.body.data.materialSubType ?? null).toBeNull();
    });

    it('USER 토큰이어도 후보 조회(GET thread-tape-candidates)는 그대로 된다(바뀌지 않음)', async () => {
      await authAsUser(request(http()).get('/items/thread-tape-candidates').query({ reviewed: 'false' })).expect(200);
    });

    it('MANAGER/ADMIN 토큰이면 그대로 성공한다(회귀 확인)', async () => {
      const item = await auth(request(http()).post('/items')).send({ code: `TT-PERM-OK-${tag}`, name: `코아사 ${tag}PERMOK`, type: 'RAW_MATERIAL' }).expect(201);

      const res = await auth(request(http()).post('/items/thread-tape-classification')).send({
        assignments: [{ itemId: item.body.data.id, materialSubType: 'COA_SA' }],
      }).expect(201);
      expect(res.body.data).toEqual({ updated: 1 });
    });
  });

  // PR-186-FIX: 인라인 타입이던 바디를 DTO로 바꿔, 형식이 틀리면 500이 아니라 400으로 거절되는지 확인.
  describe('요청 형식 검증 (PR-186-FIX)', () => {
    it('itemId가 문자열이면(숫자 아님) 400이다', async () => {
      await auth(request(http()).post('/items/thread-tape-classification')).send({
        assignments: [{ itemId: 'not-a-number', materialSubType: 'COA_SA' }],
      }).expect(400);
    });

    it('assignments가 배열이 아니면 400이다', async () => {
      await auth(request(http()).post('/items/thread-tape-classification')).send({
        assignments: { itemId: 1, materialSubType: 'COA_SA' },
      }).expect(400);
    });

    it('assignments가 500건을 넘으면 400이다', async () => {
      const assignments = Array.from({ length: 501 }, (_, i) => ({ itemId: i + 1, materialSubType: null }));
      await auth(request(http()).post('/items/thread-tape-classification')).send({ assignments }).expect(400);
    });

    it('materialSubType이 숫자면(문자열/null 아님) 400이다', async () => {
      await auth(request(http()).post('/items/thread-tape-classification')).send({
        assignments: [{ itemId: 1, materialSubType: 123 }],
      }).expect(400);
    });
  });
});
