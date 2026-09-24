import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-flow.sqlite');
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

// PR-082: 완제품 수입통관 추적 전체 흐름 — 등록(HS코드 자동조회) → 조회 →
// 통관완료 처리, 그리고 HS코드 미확인 라인을 수동 입력했을 때 PR-081
// HsCodeClassification에 실제로 반영되는지까지 검증한다.
describe('수입통관(ImportShipment) 회귀 테스트 (PR-082)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  const createStyle = async (styleNo: string) => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo,
          styleName: 'Import Flow Test',
          itemType: 'JK',
          brand: 'Test',
          productionType: 'FOB',
          factory: 'TY VN',
          buyer: 'Test Buyer',
          totalQty: 100,
          targetRdd: '2027-01-01',
        },
        bomItems: [],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);
  };

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
    dataSource = app.get(DataSource);

    // POST /hs-code-classifications(수동 등록, PR-081)는 MANAGER/ADMIN 전용이라
    // 사전조건 세팅을 위해 테스트 유저를 매니저로 승급해 둔다 — import-shipments
    // 자체의 API(생성/조회/상태전이/HS코드 수동입력)는 권한 제한이 없다(스펙 4절).
    const email = `import-shipments-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Import Shipments E2E' });
    await dataSource.getRepository(User).update({ email }, { role: UserRole.MANAGER });
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

  it('HS코드 자동매칭: 사전 등록된 조합이면 hsCode가 자동으로 채워지고 StyleHsCodeMapping이 upsert된다', async () => {
    const styleNo = `IMP-MATCH-${Date.now()}`;
    await createStyle(styleNo);

    // PR-081 POST /hs-code-classifications로 조합을 먼저 등록해 둔다(beforeAll에서
    // 이미 매니저로 승급해 둔 토큰 사용).
    await request(app.getHttpServer())
      .post('/hs-code-classifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        itemType: "WOMEN'S JACKET",
        fabricType: '직물',
        composition: 'WOOL 98%, POLYURETHANE 2%',
        hsCode: '6202.20.1000',
      })
      .expect(201);

    const createRes = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        invoiceNo: 'TYVN2026-26',
        invoiceDate: '2026-09-15',
        lines: [
          {
            itemType: "WOMEN'S JACKET",
            fabricType: '직물',
            composition: 'WOOL 98%, POLYURETHANE 2%',
            qty: 100,
            unit: 'EA',
          },
        ],
      })
      .expect(201);

    expect(createRes.body.data.status).toBe('PENDING_CLEARANCE');
    expect(createRes.body.data.lines).toHaveLength(1);
    expect(createRes.body.data.lines[0].hsCode).toBe('6202.20.1000');
    expect(createRes.body.data.lines[0].unmatched).toBe(false);

    const getRes = await request(app.getHttpServer())
      .get(`/import-shipments/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body.data.lines[0].hsCode).toBe('6202.20.1000');
  });

  it('HS코드 미확인: 사전 등록되지 않은 조합이면 hsCode는 null, unmatched:true로 표시된다', async () => {
    const styleNo = `IMP-UNMATCHED-${Date.now()}`;
    await createStyle(styleNo);

    const createRes = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        lines: [
          {
            itemType: "WOMEN'S SKIRT",
            composition: 'NEVER SEEN BEFORE COMPOSITION',
            qty: 10,
            unit: 'EA',
          },
        ],
      })
      .expect(201);

    expect(createRes.body.data.lines[0].hsCode).toBeNull();
    expect(createRes.body.data.lines[0].unmatched).toBe(true);
    // fabricType 미지정 시 기본값 '직물'이 저장되어야 한다.
    expect(createRes.body.data.lines[0].fabricType).toBe('직물');

    const shipmentId = createRes.body.data.id;
    const lineId = createRes.body.data.lines[0].id;

    // PUT .../lines/:lineId로 hsCode를 수동 입력하면 HsCodeClassification에도
    // 새 조합이 등록되어 다음부터 by-style/lookup으로 조회 가능해야 한다.
    const updateRes = await request(app.getHttpServer())
      .put(`/import-shipments/${shipmentId}/lines/${lineId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ hsCode: '6204.53.0000' })
      .expect(200);

    expect(updateRes.body.data.hsCode).toBe('6204.53.0000');
    expect(updateRes.body.data.unmatched).toBe(false);

    const listRes = await request(app.getHttpServer())
      .get('/hs-code-classifications')
      .set('Authorization', `Bearer ${token}`)
      .query({ itemType: "WOMEN'S SKIRT" })
      .expect(200);
    const found = listRes.body.data.items.find(
      (i: any) => i.composition === 'NEVER SEEN BEFORE COMPOSITION',
    );
    expect(found).toBeDefined();
    expect(found.hsCode).toBe('6204.53.0000');
  });

  it('전체 흐름: 등록 → 조회 → 통관완료 처리, 역행은 차단된다', async () => {
    const styleNo = `IMP-FLOW-${Date.now()}`;
    await createStyle(styleNo);

    const createRes = await request(app.getHttpServer())
      .post('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        lines: [{ itemType: "WOMEN'S PANTS", composition: 'COTTON 100%', qty: 5, unit: 'EA' }],
      })
      .expect(201);
    const id = createRes.body.data.id;

    const getRes = await request(app.getHttpServer())
      .get(`/import-shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body.data.status).toBe('PENDING_CLEARANCE');
    expect(getRes.body.data.style).toBeDefined();

    const listRes = await request(app.getHttpServer())
      .get('/import-shipments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.some((s: any) => s.id === id)).toBe(true);

    await request(app.getHttpServer())
      .put(`/import-shipments/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CLEARED' })
      .expect(200);

    const clearedRes = await request(app.getHttpServer())
      .get(`/import-shipments/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(clearedRes.body.data.status).toBe('CLEARED');
    expect(clearedRes.body.data.clearedAt).not.toBeNull();

    // 역행 차단: CLEARED -> PENDING_CLEARANCE는 400이어야 한다.
    await request(app.getHttpServer())
      .put(`/import-shipments/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PENDING_CLEARANCE' })
      .expect(400);
  });

  it('존재하지 않는 문서 조회는 404여야 한다', async () => {
    await request(app.getHttpServer())
      .get('/import-shipments/999999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
