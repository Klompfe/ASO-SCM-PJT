import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-brand-classification-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-111: 브랜드 접두사 규칙 CRUD + 오더관리(master-styles)/수입선적(import-shipments)
// 목록 조회에 붙은 brand 계산값/필터를 실제 HTTP 레벨로 검증한다.
describe('스타일번호 접두사 기반 브랜드 분류 (PR-111)', () => {
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

    const email = `brand-classification-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Brand Classification E2E' });
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

  describe('브랜드 접두사 규칙 CRUD', () => {
    let bfRuleId: number;

    it('접두사 규칙을 등록하면 대문자로 정규화되어 저장된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ prefix: 'bf', brandName: '빈폴' })
        .expect(201);
      expect(res.body.data.prefix).toBe('BF');
      bfRuleId = res.body.data.id;
    });

    it('같은 접두사를 다시 등록하면 400이다', async () => {
      await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ prefix: 'BF', brandName: '다른브랜드' })
        .expect(400);
    });

    it('숫자시작 규칙을 등록할 수 있다', async () => {
      const res = await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ isNumericStart: true, brandName: '에잇세컨즈' })
        .expect(201);
      expect(res.body.data.prefix).toBeNull();
      expect(res.body.data.isNumericStart).toBe(true);
    });

    it('숫자시작 규칙을 또 등록하려 하면 400이다', async () => {
      await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ isNumericStart: true, brandName: '다른브랜드' })
        .expect(400);
    });

    it('비고를 수정할 수 있다', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/brand-prefix-rules/${bfRuleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: '메모 테스트' })
        .expect(200);
      expect(res.body.data.note).toBe('메모 테스트');
      expect(res.body.data.prefix).toBe('BF');
    });

    it('목록 조회 시 등록한 규칙들이 모두 보인다', async () => {
      const res = await request(app.getHttpServer())
        .get('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const brandNames = res.body.data.map((r: any) => r.brandName);
      expect(brandNames).toEqual(expect.arrayContaining(['빈폴', '에잇세컨즈']));
    });

    it('삭제할 수 있다', async () => {
      await request(app.getHttpServer())
        .delete(`/brand-prefix-rules/${bfRuleId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.some((r: any) => r.id === bfRuleId)).toBe(false);
    });

    it('존재하지 않는 id를 삭제하려 하면 404다', async () => {
      await request(app.getHttpServer())
        .delete('/brand-prefix-rules/999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('오더관리(master-styles)/수입선적(import-shipments) 브랜드 계산·필터', () => {
    const ts = Date.now();

    beforeAll(async () => {
      // 위 CRUD 테스트에서 BF/숫자시작 규칙을 지웠으니, 이 describe 전용으로
      // 다시 등록한다(각 describe가 서로 다른 상태에 의존하지 않도록).
      await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ prefix: 'BF', brandName: '빈폴' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/brand-prefix-rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ prefix: 'MB', brandName: '미센스' })
        .expect(201);
    });

    const bfStyle = `BF-BRAND-${ts}`;
    const mbStyle = `MB-BRAND-${ts}`;
    const unmatchedStyle = `ZZ-BRAND-${ts}`;

    const createStyle = (styleNo: string) =>
      request(app.getHttpServer())
        .post('/master-styles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          styleNo, factory: '베트남', buyer: 'Brand E2E 바이어', totalQty: 100,
          brand: 'unused-legacy-field', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01',
        })
        .expect(201);

    it('사전 준비: BF/MB/미분류 접두사로 스타일 3건을 등록한다', async () => {
      await createStyle(bfStyle);
      await createStyle(mbStyle);
      await createStyle(unmatchedStyle);
    });

    it('GET /master-styles는 각 스타일에 접두사로 계산한 brand를 붙여 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/master-styles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const byStyleNo = new Map<string, any>(res.body.data.map((s: any) => [s.styleNo, s]));
      expect(byStyleNo.get(bfStyle).brand).toBe('빈폴');
      expect(byStyleNo.get(mbStyle).brand).toBe('미센스');
      expect(byStyleNo.get(unmatchedStyle).brand).toBeNull();
    });

    it('GET /master-styles?brand=빈폴은 빈폴 스타일만 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/master-styles')
        .query({ brand: '빈폴' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const styleNos = res.body.data.map((s: any) => s.styleNo);
      expect(styleNos).toContain(bfStyle);
      expect(styleNos).not.toContain(mbStyle);
      expect(styleNos).not.toContain(unmatchedStyle);
    });

    it('사전 준비: BF/MB 스타일로 수입통관 문서를 각각 만든다', async () => {
      await request(app.getHttpServer())
        .post('/import-shipments')
        .set('Authorization', `Bearer ${token}`)
        .send({ styleNo: bfStyle, lines: [{ itemType: 'JACKET', qty: 10, unit: 'EA' }] })
        .expect(201);
      await request(app.getHttpServer())
        .post('/import-shipments')
        .set('Authorization', `Bearer ${token}`)
        .send({ styleNo: mbStyle, lines: [{ itemType: 'JACKET', qty: 10, unit: 'EA' }] })
        .expect(201);
    });

    it('GET /import-shipments도 각 문서에 brand를 붙여 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/import-shipments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const byStyleNo = new Map<string, any>(res.body.data.map((s: any) => [s.styleNo, s]));
      expect(byStyleNo.get(bfStyle).brand).toBe('빈폴');
      expect(byStyleNo.get(mbStyle).brand).toBe('미센스');
    });

    it('GET /import-shipments?brand=미센스는 미센스 문서만 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/import-shipments')
        .query({ brand: '미센스' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const styleNos = res.body.data.map((s: any) => s.styleNo);
      expect(styleNos).toContain(mbStyle);
      expect(styleNos).not.toContain(bfStyle);
    });
  });
});
