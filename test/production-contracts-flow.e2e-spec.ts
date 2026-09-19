import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-production-contracts-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-093: 태일비나 생산계약(ProductionContract) 1단계(PRE_AGREED) + 2단계 구조(CMT_INVOICE)를
// 실제 HTTP 요청으로 검증한다. 2단계의 실제 "IV CMT 시트 파싱"은 이번 PR 범위 밖이므로,
// 여기서는 CMT_INVOICE로 생성 시 cmtPrice가 null·priceStatus가 PENDING_CMT_INVOICE로
// 시작하는 "구조"만 확인한다.
describe('생산계약(ProductionContract) 흐름 (PR-093)', () => {
  let app: INestApplication;
  let token: string;
  let manufacturerId: number;

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

    const email = `production-contracts-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Production Contracts E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    // 태일비나도 일반 Supplier 레코드로 등록해서 참조한다(요구사항 명시).
    const supplierRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '태일비나' })
      .expect(201);
    manufacturerId = supplierRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('PRE_AGREED(1단계)로 생성하면 cmtPrice가 그대로 저장되고 priceStatus가 CONFIRMED여야 한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/production-contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: 'PC-E2E-PREAGREED',
        manufacturerId,
        priceSource: 'PRE_AGREED',
        cmtPrice: 12.5,
        quantity: 1000,
        contractDate: '2026-09-15',
        note: '고객사 계약에서 이미 확정된 단가',
      })
      .expect(201);

    expect(res.body.data.priceSource).toBe('PRE_AGREED');
    expect(Number(res.body.data.cmtPrice)).toBe(12.5);
    expect(res.body.data.priceStatus).toBe('CONFIRMED');
    expect(res.body.data.manufacturerId).toBe(manufacturerId);

    const getRes = await request(app.getHttpServer())
      .get(`/production-contracts/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // findOne()은 manufacturer 관계까지 조인해서 내려준다(목록/상세 화면에서
    // 제조사명을 바로 표시할 수 있어야 하므로).
    expect(getRes.body.data.manufacturer.id).toBe(manufacturerId);
    expect(getRes.body.data.manufacturer.name).toBe('태일비나');
  });

  it('CMT_INVOICE(2단계 자리)로 생성하면 cmtPrice가 null이고 priceStatus가 PENDING_CMT_INVOICE여야 한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/production-contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: 'PC-E2E-CMTINVOICE',
        manufacturerId,
        priceSource: 'CMT_INVOICE',
        quantity: 500,
        contractDate: '2026-09-15',
      })
      .expect(201);

    expect(res.body.data.priceSource).toBe('CMT_INVOICE');
    expect(res.body.data.cmtPrice).toBeNull();
    expect(res.body.data.priceStatus).toBe('PENDING_CMT_INVOICE');
  });

  it('PRE_AGREED인데 cmtPrice를 안 보내면 400이어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/production-contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: 'PC-E2E-INVALID-1',
        manufacturerId,
        priceSource: 'PRE_AGREED',
        quantity: 100,
        contractDate: '2026-09-15',
      })
      .expect(400);
  });

  it('CMT_INVOICE인데 cmtPrice를 보내면 400이어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/production-contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: 'PC-E2E-INVALID-2',
        manufacturerId,
        priceSource: 'CMT_INVOICE',
        cmtPrice: 9.9,
        quantity: 100,
        contractDate: '2026-09-15',
      })
      .expect(400);
  });

  it('GET /production-contracts/:id로 생성한 계약을 다시 조회할 수 있어야 한다', async () => {
    const created = await request(app.getHttpServer())
      .post('/production-contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo: 'PC-E2E-GET',
        manufacturerId,
        priceSource: 'PRE_AGREED',
        cmtPrice: 7,
        quantity: 200,
        contractDate: '2026-09-15',
      })
      .expect(201);

    const getRes = await request(app.getHttpServer())
      .get(`/production-contracts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body.data.styleNo).toBe('PC-E2E-GET');
  });

  // PR-115: 계약일 기간(from/to) 필터 — 양끝 포함, 한쪽만 줘도 동작, 잘못된 형식은 400.
  it('계약일 from/to 필터: 양끝 포함, 한쪽만 지정 가능, 형식 오류는 400', async () => {
    const mk = (styleNo: string, contractDate: string, pending: boolean) =>
      request(app.getHttpServer())
        .post('/production-contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          styleNo, manufacturerId, quantity: 10, contractDate,
          ...(pending ? { priceSource: 'CMT_INVOICE' } : { priceSource: 'PRE_AGREED', cmtPrice: 1 }),
        })
        .expect(201);
    await mk('PC-RNG-A', '2031-03-01', false);
    await mk('PC-RNG-B', '2031-03-15', true);
    await mk('PC-RNG-C', '2031-03-31', false);
    await mk('PC-RNG-D', '2031-04-01', true);

    const list = async (q: string) =>
      (await request(app.getHttpServer()).get(`/production-contracts${q}`).set('Authorization', `Bearer ${token}`).expect(200))
        .body.data.map((c: any) => c.styleNo).filter((n: string) => n.startsWith('PC-RNG-')).sort();

    expect(await list('?from=2031-03-01&to=2031-03-31')).toEqual(['PC-RNG-A', 'PC-RNG-B', 'PC-RNG-C']);
    expect(await list('?from=2031-03-15&to=2031-03-15')).toEqual(['PC-RNG-B']);
    expect(await list('?from=2031-03-16')).toEqual(['PC-RNG-C', 'PC-RNG-D']);
    expect(await list('?to=2031-03-14')).toEqual(['PC-RNG-A']);
    expect(await list('')).toEqual(['PC-RNG-A', 'PC-RNG-B', 'PC-RNG-C', 'PC-RNG-D']);
    expect(await list('?from=2032-01-01&to=2032-12-31')).toEqual([]);
    await request(app.getHttpServer()).get('/production-contracts?from=notadate').set('Authorization', `Bearer ${token}`).expect(400);
  });
});
