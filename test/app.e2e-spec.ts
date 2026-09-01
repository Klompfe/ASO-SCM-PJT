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
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. 인증 및 마스터 데이터 준비
  it('Setup: Register & Login', async () => {
    const userDto = {
      username: 'e2euser',
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
        code: `SUP_E2E_${Date.now()}`,
        name: 'E2E 테스트 공급사',
        contactPerson: '테스터',
        email: 'e2e@supplier.com',
        phone: '010-0000-0000',
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
          orderNumber: `WO_E2E_${Date.now()}`,
          itemId: finishedItemId,
          targetQuantity: 20, // quantity -> targetQuantity 로 필드명 보정
          startDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          status: 'PLANNED',
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