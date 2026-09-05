import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-shipments-flow.sqlite');
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Shipments 상태 전이 회귀 테스트 (PR-019)', () => {
  let app: INestApplication;
  let jwtToken: string;

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

    const email = `shipments-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Shipments E2E' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123!' })
      .expect(201);
    jwtToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('생성 → SHIPPING → DELIVERED 정상 전이, DELIVERED 재전이 시도 시 400이어야 한다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/shipments')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ shipmentNumber: `SHIP-E2E-${Date.now()}` })
      .expect(201);

    const shipmentId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('SHIPPING');

    const deliveredRes = await request(app.getHttpServer())
      .patch(`/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200);
    expect(deliveredRes.body.data.status).toBe('DELIVERED');

    // 이미 DELIVERED인 건에 대해 다시 DELIVERED로 전이를 시도하면 막혀야 한다.
    await request(app.getHttpServer())
      .patch(`/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'DELIVERED' })
      .expect(400);

    // DELIVERED에서 SHIPPING으로의 역행도 막혀야 한다.
    await request(app.getHttpServer())
      .patch(`/shipments/${shipmentId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'SHIPPING' })
      .expect(400);
  });

  it('SHIPPING 상태에서 SHIPPING으로의(동일 상태) 재요청도 400이어야 한다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/shipments')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ shipmentNumber: `SHIP-E2E-SAME-${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/shipments/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'SHIPPING' })
      .expect(400);
  });
});
