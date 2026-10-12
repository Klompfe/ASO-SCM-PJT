import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-mido-price-table-admin-flow.sqlite');
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

// PR-188 C: 미도 단가표 관리(등록/수정/사용중지) + CSV 일괄 등록(미리보기 → 적용).
describe('미도 단가표 관리 · 일괄 등록 (PR-188)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let userToken: string;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const asManager = (r: request.Test) => r.set('Authorization', `Bearer ${managerToken}`);
  const asUser = (r: request.Test) => r.set('Authorization', `Bearer ${userToken}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const managerEmail = `mido-admin-manager-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email: managerEmail, password: 'password123!', name: 'Mido Admin Manager' });
    await dataSource.getRepository(User).update({ email: managerEmail }, { role: UserRole.MANAGER });
    managerToken = (await request(http()).post('/auth/login').send({ email: managerEmail, password: 'password123!' }).expect(201)).body.data.accessToken;

    const userEmail = `mido-admin-user-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email: userEmail, password: 'password123!', name: 'Mido Admin User' });
    userToken = (await request(http()).post('/auth/login').send({ email: userEmail, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const HEADER = 'itemName,priceUsdMin,priceUsdMax,unit,note';

  describe('단건 등록/수정', () => {
    it('MANAGER는 등록할 수 있고, USER는 403이다', async () => {
      await asUser(request(http()).post('/mido-price-table')).send({
        itemName: `단건항목USER거절 ${tag}`, priceUsdMin: 1, priceUsdMax: 1, unit: 'YD',
      }).expect(403);

      const created = await asManager(request(http()).post('/mido-price-table')).send({
        itemName: `단건항목 ${tag}`, priceUsdMin: 1, priceUsdMax: 1, unit: 'YD',
      }).expect(201);
      expect(created.body.data).toMatchObject({ itemName: `단건항목 ${tag}`, isActive: true });
    });

    it('중복 itemName은 400이다', async () => {
      await asManager(request(http()).post('/mido-price-table')).send({
        itemName: `단건항목 ${tag}`, priceUsdMin: 2, priceUsdMax: 2, unit: 'YD',
      }).expect(400);
    });

    it('isActive를 false로 바꾸면 사용 중지되고, 후보 검색(findCandidates 기반 price-reference 등)에서 제외된다(기본 목록 조회에서 빠짐)', async () => {
      const created = await asManager(request(http()).post('/mido-price-table')).send({
        itemName: `사용중지대상 ${tag}`, priceUsdMin: 1, priceUsdMax: 1, unit: 'YD',
      }).expect(201);

      const before = await asUser(request(http()).get('/mido-price-table')).expect(200);
      expect(before.body.data.some((r: any) => r.itemName === `사용중지대상 ${tag}`)).toBe(true);

      await asManager(request(http()).patch(`/mido-price-table/${created.body.data.id}`)).send({ isActive: false }).expect(200);

      const afterDefault = await asUser(request(http()).get('/mido-price-table')).expect(200);
      expect(afterDefault.body.data.some((r: any) => r.itemName === `사용중지대상 ${tag}`)).toBe(false);

      const afterAll = await asUser(request(http()).get('/mido-price-table')).query({ includeInactive: 'true' }).expect(200);
      const found = afterAll.body.data.find((r: any) => r.itemName === `사용중지대상 ${tag}`);
      expect(found).toMatchObject({ isActive: false });
    });
  });

  describe('CSV 일괄 등록: 미리보기 → 적용 → 반영 확인', () => {
    it('미리보기는 권한 없이도 되고(DB에 쓰지 않음), 적용은 MANAGER만 되며 GET에 반영된다', async () => {
      const csv = `${HEADER}\n일괄신규항목A ${tag},1.5,1.5,YD,비고\n일괄신규항목B ${tag},0.002,0.003,M,`;

      // 1) 미리보기 — 누구나(USER 토큰) 가능, DB에 아직 반영 안 됨.
      const preview = await asUser(request(http()).post('/mido-price-table/import/preview')).send({ csv }).expect(201);
      expect(preview.body.data.summary).toMatchObject({ new: 2, changed: 0, same: 0, error: 0, total: 2 });
      const beforeApply = await asUser(request(http()).get('/mido-price-table')).expect(200);
      expect(beforeApply.body.data.some((r: any) => r.itemName === `일괄신규항목A ${tag}`)).toBe(false);

      // 2) 적용 — USER는 403.
      await asUser(request(http()).post('/mido-price-table/import/apply')).send({
        rows: preview.body.data.rows.map((r: any) => ({ ...r.after, line: r.line, status: r.status })),
      }).expect(403);

      // 3) 적용 — MANAGER는 성공.
      const applied = await asManager(request(http()).post('/mido-price-table/import/apply')).send({
        rows: preview.body.data.rows.map((r: any) => ({ ...r.after, line: r.line, status: r.status })),
      }).expect(201);
      expect(applied.body.data).toEqual({ created: 2, updated: 0 });

      // 4) GET에 반영 확인.
      const afterApply = await asUser(request(http()).get('/mido-price-table')).expect(200);
      expect(afterApply.body.data.some((r: any) => r.itemName === `일괄신규항목A ${tag}`)).toBe(true);
      expect(afterApply.body.data.some((r: any) => r.itemName === `일괄신규항목B ${tag}`)).toBe(true);
    });

    it('같은 itemName을 값만 바꿔 다시 올리면 CHANGED로 분류되고, 적용하면 upsert(수정)된다', async () => {
      const csv1 = `${HEADER}\n재등록대상 ${tag},1,1,YD,`;
      const p1 = await asManager(request(http()).post('/mido-price-table/import/preview')).send({ csv: csv1 }).expect(201);
      await asManager(request(http()).post('/mido-price-table/import/apply')).send({
        rows: p1.body.data.rows.map((r: any) => ({ ...r.after, line: r.line, status: r.status })),
      }).expect(201);

      const csv2 = `${HEADER}\n재등록대상 ${tag},2.5,3,YD,변경됨`;
      const p2 = await asManager(request(http()).post('/mido-price-table/import/preview')).send({ csv: csv2 }).expect(201);
      expect(p2.body.data.rows[0].status).toBe('CHANGED');
      expect(p2.body.data.rows[0].before).toMatchObject({ priceUsdMin: 1, priceUsdMax: 1 });

      const applied = await asManager(request(http()).post('/mido-price-table/import/apply')).send({
        rows: p2.body.data.rows.map((r: any) => ({ ...r.after, line: r.line, status: r.status })),
      }).expect(201);
      expect(applied.body.data).toEqual({ created: 0, updated: 1 });

      const after = await asUser(request(http()).get('/mido-price-table')).expect(200);
      const row = after.body.data.find((r: any) => r.itemName === `재등록대상 ${tag}`);
      expect(Number(row.priceUsdMin)).toBe(2.5);
      expect(Number(row.priceUsdMax)).toBe(3);
    });

    it('형식 오류가 있는 행은 미리보기에서 ERROR로 표시되고(적용 대상에서 제외), 헤더가 깨진 CSV는 미리보기 자체가 400이다', async () => {
      const csv = `${HEADER}\n정상행 ${tag},1,1,YD,\n오류행 ${tag},abc,1,YD,`;
      const preview = await asManager(request(http()).post('/mido-price-table/import/preview')).send({ csv }).expect(201);
      const errorRow = preview.body.data.rows.find((r: any) => r.after.itemName === `오류행 ${tag}`);
      expect(errorRow.status).toBe('ERROR');
      expect(errorRow.errors.length).toBeGreaterThan(0);

      await asManager(request(http()).post('/mido-price-table/import/preview')).send({ csv: 'a,b,c\n1,2,3' }).expect(400);
    });

    it('실제 등록 예정 CSV처럼 itemName에 쉼표/큰따옴표가 있어도 정확히 파싱된다', async () => {
      const csv = `${HEADER}\n"겉감(POLYESTER 95%, POLYURETHANE 5%) ${tag}",1.2,1.5,YD,\n"안감(LINING POLYESTER 100%) 58""/60"" ${tag}",0.5,0.5,YD,`;
      const preview = await asManager(request(http()).post('/mido-price-table/import/preview')).send({ csv }).expect(201);
      expect(preview.body.data.rows[0].after.itemName).toBe(`겉감(POLYESTER 95%, POLYURETHANE 5%) ${tag}`);
      expect(preview.body.data.rows[1].after.itemName).toBe(`안감(LINING POLYESTER 100%) 58"/60" ${tag}`);
      expect(preview.body.data.summary.error).toBe(0);
    });

    it('적용 요청에 형식 오류가 섞이면 all-or-nothing으로 전부 거절되고 정상 행도 저장되지 않는다', async () => {
      const applyRes = await asManager(request(http()).post('/mido-price-table/import/apply')).send({
        rows: [
          { line: 1, itemName: `올낫싱정상 ${tag}`, priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
          { line: 2, itemName: `올낫싱오류 ${tag}`, priceUsdMin: 5, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
        ],
      }).set('Authorization', `Bearer ${managerToken}`).expect(400);
      expect(applyRes.body).toBeDefined();

      const after = await asUser(request(http()).get('/mido-price-table')).expect(200);
      expect(after.body.data.some((r: any) => r.itemName === `올낫싱정상 ${tag}`)).toBe(false);
    });
  });
});
