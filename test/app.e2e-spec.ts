import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

jest.setTimeout(30000);

describe('SCM API (E2E Integration Test)', () => {
  let app: INestApplication;
  let jwtToken: string;
  let rawMaterialId: number;
  let finishedProductId: number;
  let createdPoId: number;
  let createdWoId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    const timestamp = Date.now();
    const authDto = {
      username: `e2e_user_${timestamp}`,
      email: `e2e_${timestamp}@example.com`,
      password: 'password123',
    };

    const regRes = await request(app.getHttpServer()).post('/auth/register').send(authDto);
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
      username: authDto.username,
      password: authDto.password,
    });

    jwtToken = loginRes.body.accessToken || loginRes.body.token;

    console.log('=== AUTH DIAGNOSTIC LOG ===');
    console.log('Register Status:', regRes.status);
    console.log('Login Status:', loginRes.status);
    console.log('JWT Token Exists:', !!jwtToken);
    console.log('===========================');

    // 1. 원자재 품목 생성
    const rawMaterialRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        code: `RM-E2E-${timestamp}`,
        name: 'E2E 철강 원자재',
        type: 'RAW_MATERIAL',
        unit: 'EA',
      });
    
    rawMaterialId = rawMaterialRes.body?.id || rawMaterialRes.body?.itemId;

    // 2. 완제품 품목 생성
    const finishedProductRes = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        code: `FP-E2E-${timestamp}`,
        name: 'E2E 프레임 완제품',
        type: 'FINISHED_GOOD',
        unit: 'EA',
      });

    finishedProductId = finishedProductRes.body?.id || finishedProductRes.body?.itemId;

    console.log('=== DATA PREPARATION DIAGNOSTIC ===');
    console.log('Raw Material Item Status:', rawMaterialRes.status);
    if (rawMaterialRes.status !== 201) {
      console.log('Raw Material Error:', JSON.stringify(rawMaterialRes.body));
    }
    console.log('Raw Material Item ID:', rawMaterialId);
    console.log('Finished Product Item ID:', finishedProductId);
    console.log('====================================');

    // 3. BOM 등록
    if (finishedProductId && rawMaterialId) {
      await request(app.getHttpServer())
        .post('/boms')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          parentItemId: finishedProductId,
          childItemId: rawMaterialId,
          quantity: 2,
        });
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('/purchase-orders', () => {
    it('POST /purchase-orders - 원자재 발주서 생성', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          itemId: rawMaterialId,
          quantity: 100,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      createdPoId = res.body.id;
    });

    it('GET /purchase-orders - 발주 목록 조회 (페이징 & 필터)', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchase-orders?page=1&limit=10&status=PENDING')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('PATCH /purchase-orders/:id/status - 입고 처리(RECEIVED) 및 재고 자동 증가', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/purchase-orders/${createdPoId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ status: 'RECEIVED' })
        .expect(200);

      expect(res.body.status).toBe('RECEIVED');

      const invRes = await request(app.getHttpServer())
        .get(`/inventory/${rawMaterialId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(invRes.body.quantity).toBe(100);
    });

    it('PATCH /purchase-orders/:id/cancel - 신규 발주서 취소 처리', async () => {
      const newPo = await request(app.getHttpServer())
        .post('/purchase-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          itemId: rawMaterialId,
          quantity: 50,
        });

      const res = await request(app.getHttpServer())
        .patch(`/purchase-orders/${newPo.body.id}/cancel`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
    });

    it('PATCH /purchase-orders/:id/status - 이미 입고 완료된 발주서 상태 변경 시 400 에러', async () => {
      await request(app.getHttpServer())
        .patch(`/purchase-orders/${createdPoId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ status: 'CANCELLED' })
        .expect(400);
    });

    it('GET /purchase-orders/99999 - 존재하지 않는 ID 조회 시 404 에러', async () => {
      await request(app.getHttpServer())
        .get('/purchase-orders/99999')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });
  });

  describe('/work-orders', () => {
    it('POST /work-orders - 완제품 작업 지시 생성', async () => {
      const res = await request(app.getHttpServer())
        .post('/work-orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          itemId: finishedProductId,
          targetQuantity: 10,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      createdWoId = res.body.id;
    });

    it('GET /work-orders - 작업 지시 목록 조회 (페이징 & 필터)', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-orders?page=1&limit=10')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('PATCH /work-orders/:id/status - 생산 완료(COMPLETED) 및 원자재 차감/완제품 재고 증대', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-orders/${createdWoId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');

      const rawInv = await request(app.getHttpServer())
        .get(`/inventory/${rawMaterialId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(rawInv.body.quantity).toBe(80);

      const finishedInv = await request(app.getHttpServer())
        .get(`/inventory/${finishedProductId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(finishedInv.body.quantity).toBe(10);
    });
  });
});