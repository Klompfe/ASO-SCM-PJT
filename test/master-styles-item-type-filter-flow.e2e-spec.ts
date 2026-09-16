import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-master-styles-item-type-filter-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-101: GET /master-styles?itemType=... 필터가 정확히 일치하는 스타일만
// 반환하는지 검증한다(PANTS 2건, JACKET 1건을 등록해 PANTS로 필터링 시 2건만
// 나오는지 확인 — 완료 보고에서 요구한 실제 검증 시나리오와 동일).
describe('GET /master-styles - itemType 필터 (PR-101)', () => {
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

    const email = `master-styles-itemtype-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'ItemType Filter E2E' });
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
  const pantsStyle1 = `ITEMTYPE-PANTS-1-${ts}`;
  const pantsStyle2 = `ITEMTYPE-PANTS-2-${ts}`;
  const jacketStyle = `ITEMTYPE-JACKET-${ts}`;

  const createStyle = (styleNo: string, itemType: string) =>
    request(app.getHttpServer())
      .post('/master-styles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo, factory: '베트남', buyer: 'ItemType E2E 바이어', totalQty: 100,
        brand: 'TestBrand', itemType, productionType: 'FOB', targetRdd: '2026-12-01',
      })
      .expect(201);

  it('PANTS 2건, JACKET 1건을 등록하고 itemType=PANTS로 필터링하면 2건만 반환된다', async () => {
    await createStyle(pantsStyle1, 'PANTS');
    await createStyle(pantsStyle2, 'PANTS');
    await createStyle(jacketStyle, 'JACKET');

    const res = await request(app.getHttpServer())
      .get('/master-styles')
      .query({ itemType: 'PANTS' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const styleNos = res.body.data.map((s: any) => s.styleNo);
    expect(styleNos).toEqual(expect.arrayContaining([pantsStyle1, pantsStyle2]));
    expect(styleNos).not.toContain(jacketStyle);
    expect(res.body.data.every((s: any) => s.overview.itemType === 'PANTS')).toBe(true);
  });

  it('itemType=JACKET으로 필터링하면 1건만 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/master-styles')
      .query({ itemType: 'JACKET' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const styleNos = res.body.data.map((s: any) => s.styleNo);
    expect(styleNos).toEqual([jacketStyle]);
  });

  it('itemType과 styleNo를 함께 지정하면 둘 다 만족하는 것만 반환된다(조합 가능)', async () => {
    const res = await request(app.getHttpServer())
      .get('/master-styles')
      .query({ itemType: 'PANTS', styleNo: 'PANTS-1' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const styleNos = res.body.data.map((s: any) => s.styleNo);
    expect(styleNos).toEqual([pantsStyle1]);
  });

  it('itemType을 지정하지 않으면 전체(3건 이상)가 반환된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/master-styles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const styleNos = res.body.data.map((s: any) => s.styleNo);
    expect(styleNos).toEqual(
      expect.arrayContaining([pantsStyle1, pantsStyle2, jacketStyle]),
    );
  });
});
