import * as path from 'path';
import * as fs from 'fs';

// 다른 e2e 스펙들과 동일하게 격리된 로컬 sqlite를 쓴다 — DB_TYPE/DB_DATABASE를
// .env(운영 Postgres를 가리킬 수 있음)에 맡기면 실제 DB에 테스트 데이터가 쌓인다(PR-058).
const TEST_DB_PATH = path.resolve(__dirname, '../test-db-app.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('SCM API (E2E Integration Test)', () => {
  let app: INestApplication;
  let jwtToken: string;
  let rawItemId: number;
  let finishedItemId: number;
  let supplierId: number;
  let poId: number;
  let woId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 1. 인증 및 마스터 데이터 준비
  it('Setup: Register & Login', async () => {
    const userDto = {
      email: 'e2e@scm.com',
      password: 'password123!',
      name: 'E2E Tester',
    };

    await request(app.getHttpServer()).post('/auth/register').send(userDto);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userDto.email, password: userDto.password })
      .expect(201);

    jwtToken = loginRes.body.data.accessToken || loginRes.body.data.access_token;
  });

  it('Setup: Create Master Data (Supplier, Items)', async () => {
    // 공급업체 생성
    const supRes = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        // PR-088: code는 서버가 자동채번하므로 더 이상 보내지 않는다.
        name: 'E2E 테스트 공급사',
        email: 'e2e@supplier.com',
        contactPhone: '010-0000-0000',
      })
      .expect(201);
    supplierId = supRes.body.data.id;

    // 원자재 품목 생성
    const rawRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        code: `RAW_E2E_${Date.now()}`,
        name: 'E2E 원자재',
        type: 'RAW_MATERIAL',
      })
      .expect(201);
    rawItemId = rawRes.body.data.id;

    // 완제품 품목 생성
    const finRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        code: `FIN_E2E_${Date.now()}`,
        name: 'E2E 완제품',
        type: 'FINISHED_GOOD',
      })
      .expect(201);
    finishedItemId = finRes.body.data.id;
  });

  // PR-073: 자재마스터(Item)에 영문명(englishName)을 추가했다 — 등록 시 저장되고,
  // 조회/수정에서도 그대로 반영되는지 검증한다.
  describe('/items - englishName (PR-073)', () => {
    it('englishName을 포함해 등록하면 저장되고 조회 시에도 그대로 반환되어야 한다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          code: `ENG_E2E_${Date.now()}`,
          name: '울원단',
          englishName: 'WOOL FABRIC',
          type: 'RAW_MATERIAL',
        })
        .expect(201);
      expect(createRes.body.data.englishName).toBe('WOOL FABRIC');

      const getRes = await request(app.getHttpServer())
        .get(`/items/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(getRes.body.data.englishName).toBe('WOOL FABRIC');
    });

    it('PATCH로 englishName을 수정할 수 있어야 한다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          code: `ENG_PATCH_E2E_${Date.now()}`,
          name: '폴리에스터원단',
          type: 'RAW_MATERIAL',
        })
        .expect(201);
      expect(createRes.body.data.englishName).toBeFalsy();

      const patchRes = await request(app.getHttpServer())
        .patch(`/items/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ englishName: 'POLYESTER FABRIC' })
        .expect(200);
      expect(patchRes.body.data.englishName).toBe('POLYESTER FABRIC');
    });
  });

  // PR-078: unit 컬럼 자체는 이미 있었지만(초기 마이그레이션부터 존재), 등록/수정
  // 화면과 export-shipments 생성 로직이 이 값을 실제로 쓰도록 연결한 것이 이번 PR의
  // 핵심이다 — 그러려면 "지정 안 함 = 비어 있음"이 실제로 가능해야 하므로(PR-078에서
  // 컬럼 기본값 'EA'를 제거), unit을 생략하면 더 이상 자동으로 'EA'가 채워지지
  // 않는다는 것도 함께 검증한다.
  describe('/items - unit (PR-078)', () => {
    it('unit을 포함해 등록하면 저장되고 조회 시에도 그대로 반환되어야 한다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          code: `UNIT_E2E_${Date.now()}`,
          name: '원단(단위테스트)',
          unit: 'MTS',
          type: 'RAW_MATERIAL',
        })
        .expect(201);
      expect(createRes.body.data.unit).toBe('MTS');

      const getRes = await request(app.getHttpServer())
        .get(`/items/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(getRes.body.data.unit).toBe('MTS');
    });

    it('unit을 지정하지 않고 등록하면 더 이상 자동으로 EA가 채워지지 않아야 한다(PR-078: 폴백 로직이 실제로 발동하려면 빈 값이 가능해야 함)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          code: `UNIT_NONE_E2E_${Date.now()}`,
          name: '단위미지정품목',
          type: 'RAW_MATERIAL',
        })
        .expect(201);
      expect(createRes.body.data.unit).toBeFalsy();
    });

    it('PATCH로 unit을 수정할 수 있어야 한다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          code: `UNIT_PATCH_E2E_${Date.now()}`,
          name: '단위수정품목',
          type: 'RAW_MATERIAL',
        })
        .expect(201);

      const patchRes = await request(app.getHttpServer())
        .patch(`/items/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ unit: 'ROLL' })
        .expect(200);
      expect(patchRes.body.data.unit).toBe('ROLL');
    });
  });

  // 2. 구매 주문 (Purchase Orders) 테스트
  describe('/purchase-orders', () => {
    it('POST /purchase-orders - 원자재 발주서 생성', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          supplierId: supplierId,
          itemId: rawItemId,
          quantity: 100,
          unitPrice: 5.5,
        })
        .expect(201);
      
      poId = res.body.data.id;
      expect(poId).toBeDefined();
    });

    it('GET /purchase-orders - 발주 목록 조회', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchase-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items || res.body.data)).toBe(true);
    });

    it('PATCH /purchase-orders/:id/status - 입고 처리(RECEIVED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/purchase-orders/${poId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ status: 'RECEIVED' })
        .expect(200);

      expect(res.body.data.status).toBe('RECEIVED');
    });
  });

  // 3. 작업 지시 (Work Orders) 테스트
  describe('/work-orders', () => {
    it('POST /work-orders - 완제품 작업 지시 생성', async () => {
      const res = await request(app.getHttpServer())
        .post('/work-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          itemId: finishedItemId,
          targetQuantity: 20,
        })
        .expect(201);

      woId = res.body.data.id;
      expect(woId).toBeDefined();
    });

    it('GET /work-orders - 작업 지시 목록 조회', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data.items || res.body.data)).toBe(true);
    });

    it('PATCH /work-orders/:id/status - 생산 완료(COMPLETED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-orders/${woId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
    });
  });
});