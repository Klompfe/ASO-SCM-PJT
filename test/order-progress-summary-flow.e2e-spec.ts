import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-order-progress-summary-flow.sqlite');
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

// 계약 승인/공정진행/출고 데이터가 섞인 여러 스타일을 실제로 등록해, /order-progress-summary가
// 계약상태와 무관하게 전부 집계하고(PR-067 지시사항: 미승인 계약을 이행률 계산에서 제외하지
// 않음) 진행률/출고율/이행률/납기상태를 정확히 계산하는지 검증한다.
describe('오더 진행현황 요약 (PR-067)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
    const password = 'password123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Summary Flow Tester' })
      .expect(201);
    if (role) {
      await dataSource.getRepository(User).update({ email }, { role });
    }
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return loginRes.body.data.accessToken;
  };

  const buildWorkOrderPayload = (styleNo: string, totalQty: number, targetRdd: string) => ({
    overview: {
      styleNo, styleName: '요약 테스트', itemType: 'JK', brand: 'TestBrand',
      productionType: 'FOB', factory: '베트남 공장', buyer: '요약바이어', totalQty, targetRdd,
    },
    bomItems: [
      { category: 'FABRIC', itemName: `${styleNo}-원단`, spec: null, colorCode: null, consumption: 1, requiredQty: totalQty, supplier: null, remarks: null },
    ],
    sizeSpecs: [{ part: '가슴단면', size: 'M', instructedValue: '50', sampleValue: null, diffValue: null, finalValue: null }],
    workNotes: null,
  });

  let userToken: string;
  let managerToken: string;
  const approvedStyle = `SUMMARY-APPROVED-${Date.now()}`;
  const pendingStyle = `SUMMARY-PENDING-${Date.now()}`;

  beforeAll(async () => {
    userToken = await registerAndLogin(`summary-user-${Date.now()}@test.com`);
    managerToken = await registerAndLogin(`summary-manager-${Date.now()}@test.com`, UserRole.MANAGER);

    // 미래 납기(정상 진행중)로 두 스타일 등록 — 하나는 승인, 하나는 미승인 상태로 남긴다.
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send(buildWorkOrderPayload(approvedStyle, 1000, '2027-01-01'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send(buildWorkOrderPayload(pendingStyle, 500, '2027-02-01'))
      .expect(201);

    const approvedContracts = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo: approvedStyle })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/contracts/${approvedContracts.body.data[0].id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    // approvedStyle: 재단 100%, 봉제 50%, 포장 0% + 출고 300/1000(30%)
    await request(app.getHttpServer())
      .put('/order-process-stages')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ styleNo: approvedStyle, stage: 'CUTTING', targetQty: 1000, completedQty: 1000 })
      .expect(200);
    await request(app.getHttpServer())
      .put('/order-process-stages')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ styleNo: approvedStyle, stage: 'SEWING', targetQty: 1000, completedQty: 500 })
      .expect(200);

    const shipRes = await request(app.getHttpServer())
      .post('/order-shipments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ styleNo: approvedStyle, plannedShipDate: '2026-12-01', quantity: 300 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/order-shipments/${shipRes.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ actualShipDate: '2026-12-02' })
      .expect(200);
  });

  it('여러 스타일의 진행현황을 계약상태와 무관하게 전부 반환해야 한다', async () => {
    const res = await request(app.getHttpServer())
      .get('/order-progress-summary')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const rows = res.body.data;
    const approvedRow = rows.find((r: any) => r.styleNo === approvedStyle);
    const pendingRow = rows.find((r: any) => r.styleNo === pendingStyle);

    expect(approvedRow).toBeDefined();
    expect(pendingRow).toBeDefined();

    // 승인된 스타일: contractStatus APPROVED, 재단 100%, 봉제 50%, 포장 0%(기록 없음), 출고 30%
    expect(approvedRow.contractStatus).toBe('APPROVED');
    expect(approvedRow.stages.CUTTING.rate).toBe(100);
    expect(approvedRow.stages.SEWING.rate).toBe(50);
    expect(approvedRow.stages.PACKING.rate).toBe(0);
    expect(approvedRow.shipRate).toBe(30);
    expect(approvedRow.currentStageLabel).toBe('봉제'); // 재단 100% 완료, 봉제가 100% 미만인 첫 단계
    expect(approvedRow.deliveryStatus).toBe('진행중'); // 미래 납기 + 잔량 있음

    // 이행률 = 공정평균(100+50+0)/3=50 * 0.7 + 출고율 30 * 0.3 = 35 + 9 = 44
    expect(approvedRow.fulfillmentRate).toBeCloseTo(44, 5);

    // 미승인 스타일: 계약이 PENDING_APPROVAL이어도 이행률 계산에서 제외되지 않고
    // 그대로 집계되어야 한다(전부 미착수이므로 0).
    expect(pendingRow.contractStatus).toBe('PENDING_APPROVAL');
    expect(pendingRow.currentStageLabel).toBe('미착수');
    expect(pendingRow.fulfillmentRate).toBe(0);
  });

  it('공정/출고 기록이 전혀 없는 스타일은 미착수로 표시되어야 한다', async () => {
    const res = await request(app.getHttpServer())
      .get('/order-progress-summary')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const pendingRow = res.body.data.find((r: any) => r.styleNo === pendingStyle);
    expect(pendingRow.stages.CUTTING.rate).toBe(0);
    expect(pendingRow.stages.SEWING.rate).toBe(0);
    expect(pendingRow.stages.PACKING.rate).toBe(0);
  });
});
