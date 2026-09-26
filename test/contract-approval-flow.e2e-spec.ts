import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-contract-approval-flow.sqlite');
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

// 작업지시서 등록 시 계약이 자동으로 PENDING_APPROVAL로 생성되고, 재등록 시 기존 계약을
// 덮어쓰지 않고 별도 브랜치로 쌓이며, MANAGER 승인 시 같은 스타일의 기존 APPROVED가
// SUPERSEDED로 내려가는지까지 실제 HTTP 요청으로 검증한다(PR-066).
describe('작업지시서 등록 → 계약 자동생성/승인 워크플로 (PR-066)', () => {
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
      .send({ email, password, name: 'Contract Flow Tester' })
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

  const buildWorkOrderPayload = (styleNo: string, totalQty: number) => ({
    overview: {
      styleNo,
      styleName: '테스트 스타일',
      itemType: 'JK',
      brand: 'TestBrand',
      productionType: 'FOB',
      factory: '베트남 공장',
      buyer: '테스트바이어',
      totalQty,
      targetRdd: '2026-12-01',
    },
    bomItems: [
      { category: 'FABRIC', itemName: `${styleNo}-원단`, spec: null, colorCode: null, consumption: 1, requiredQty: totalQty, supplier: null, remarks: null },
    ],
    sizeSpecs: [
      { part: '가슴단면', size: 'M', instructedValue: '50', sampleValue: null, diffValue: null, finalValue: null },
    ],
    workNotes: '테스트 작업 메모',
  });

  let userToken: string;
  let managerToken: string;
  const styleNo = `RBAC-CONTRACT-${Date.now()}`;

  beforeAll(async () => {
    userToken = await registerAndLogin(`contract-user-${Date.now()}@test.com`);
    managerToken = await registerAndLogin(`contract-manager-${Date.now()}@test.com`, UserRole.ADMIN);
  });

  let firstContractId: number;
  let secondContractId: number;

  it('작업지시서를 처음 등록하면 계약이 PENDING_APPROVAL로 자동 생성되어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send(buildWorkOrderPayload(styleNo, 1000))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const contracts = res.body.data;
    expect(contracts).toHaveLength(1);
    expect(contracts[0].status).toBe('PENDING_APPROVAL');
    expect(Number(contracts[0].totalQty)).toBe(1000);
    expect(contracts[0].factory).toBe('베트남 공장');
    firstContractId = contracts[0].id;
  });

  it('같은 styleNo로 작업지시서를 재등록하면 기존 계약을 덮어쓰지 않고 새 PENDING_APPROVAL 브랜치가 쌓여야 한다', async () => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send(buildWorkOrderPayload(styleNo, 2000))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const contracts = res.body.data;
    expect(contracts).toHaveLength(2);
    expect(contracts.every((c: any) => c.status === 'PENDING_APPROVAL')).toBe(true);

    const first = contracts.find((c: any) => c.id === firstContractId);
    expect(Number(first.totalQty)).toBe(1000); // 첫 계약은 그대로(스냅샷이므로 재등록에 영향받지 않음)

    secondContractId = contracts.find((c: any) => c.id !== firstContractId).id;
    expect(Number(contracts.find((c: any) => c.id === secondContractId).totalQty)).toBe(2000);
  });

  it('USER 권한으로 승인을 시도하면 403이어야 한다', async () => {
    await request(app.getHttpServer())
      .patch(`/contracts/${firstContractId}/approve`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('MANAGER 권한으로 첫 번째 계약을 승인하면 APPROVED가 되고, 두 번째 계약은 그대로 PENDING이어야 한다', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/contracts/${firstContractId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approvedByUserId).toBeDefined();
    expect(res.body.data.approvedAt).toBeDefined();

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const second = listRes.body.data.find((c: any) => c.id === secondContractId);
    expect(second.status).toBe('PENDING_APPROVAL');
  });

  it('이미 APPROVED인 계약을 다시 승인 시도하면 400이어야 한다', async () => {
    await request(app.getHttpServer())
      .patch(`/contracts/${firstContractId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(400);
  });

  it('두 번째 계약을 승인하면, 기존 APPROVED였던 첫 번째 계약이 SUPERSEDED로 바뀌어야 한다', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/contracts/${secondContractId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(res.body.data.status).toBe('APPROVED');

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const first = listRes.body.data.find((c: any) => c.id === firstContractId);
    expect(first.status).toBe('SUPERSEDED');
  });

  it('PENDING_APPROVAL 계약을 거절하면 REJECTED가 되어야 한다', async () => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send(buildWorkOrderPayload(styleNo, 3000))
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const pending = listRes.body.data.find((c: any) => c.status === 'PENDING_APPROVAL');
    expect(pending).toBeDefined();

    const rejectRes = await request(app.getHttpServer())
      .patch(`/contracts/${pending.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
  });

  it('MANAGER 권한으로 계약을 삭제할 수 있어야 한다', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const rejected = listRes.body.data.find((c: any) => c.status === 'REJECTED');

    await request(app.getHttpServer())
      .delete(`/contracts/${rejected.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const afterRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(afterRes.body.data.find((c: any) => c.id === rejected.id)).toBeUndefined();
  });
});
