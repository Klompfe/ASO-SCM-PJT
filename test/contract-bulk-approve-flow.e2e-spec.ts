import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-contract-bulk-approve-flow.sqlite');
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

// PR-090: PATCH /contracts/bulk-approve — 여러 PENDING_APPROVAL 계약을 한 번에
// 승인한다. 기존 approve() 로직(같은 styleNo 기존 APPROVED를 SUPERSEDED로 강등)을
// 건별로 그대로 재사용하므로, 일괄승인 후에도 그 불변식이 유지되는지까지 확인한다.
describe('계약 일괄승인 (PR-090)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

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

    const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
      const password = 'password123!';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, name: 'Bulk Approve Tester' })
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

    userToken = await registerAndLogin(`bulk-approve-user-${Date.now()}@test.com`);
    managerToken = await registerAndLogin(`bulk-approve-manager-${Date.now()}@test.com`, UserRole.ADMIN);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // MasterStyle을 하나 만들고(sales-orders/commit-analysis), 같은 스타일에 대해
  // POST /contracts(issue)로 PENDING_APPROVAL 계약을 원하는 개수만큼 추가로 쌓는다.
  const createStyleWithContracts = async (styleNo: string, extraContractCount: number): Promise<number[]> => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        overview: {
          styleNo, styleName: 'Bulk Approve Test', itemType: 'JK', brand: 'Test',
          productionType: 'FOB', factory: 'Test Factory', buyer: 'Test Buyer', totalQty: 100, targetRdd: '2027-01-01',
        },
        bomItems: [{ category: 'FABRIC', itemName: `${styleNo}-fabric`, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
        sizeSpecs: [{ part: '가슴단면', size: 'M', instructedValue: '50', sampleValue: null, diffValue: null, finalValue: null }],
        workNotes: null,
      })
      .expect(201);

    const ids: number[] = [];
    for (let i = 0; i < extraContractCount; i++) {
      const res = await request(app.getHttpServer())
        .post('/contracts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ styleNo, notes: `extra ${i}` })
        .expect(201);
      ids.push(res.body.data.id);
    }

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    return listRes.body.data.map((c: any) => c.id);
  };

  it('USER 권한으로 bulk-approve를 호출하면 403이어야 한다', async () => {
    await request(app.getHttpServer())
      .patch('/contracts/bulk-approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(403);
  });

  it('ids를 지정하면 그 계약들만 승인되고, approvedCount가 정확해야 한다', async () => {
    const styleNo = `BULK-CASE1-${Date.now()}`;
    const ids = await createStyleWithContracts(styleNo, 0); // work-order 커밋 자체가 1건 생성

    const res = await request(app.getHttpServer())
      .patch('/contracts/bulk-approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ids })
      .expect(200);

    expect(res.body.data.approvedCount).toBe(ids.length);
    expect(res.body.data.failed).toHaveLength(0);

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(listRes.body.data.every((c: any) => c.status === 'APPROVED')).toBe(true);
  });

  it('같은 styleNo의 계약 두 건을 함께 일괄승인하면, 먼저 처리된 건이 SUPERSEDED로 내려가고 최종 활성 계약은 하나여야 한다', async () => {
    const styleNo = `BULK-CASE2-${Date.now()}`;
    const ids = await createStyleWithContracts(styleNo, 1); // work-order 1건 + issue 1건 = 총 2건

    const res = await request(app.getHttpServer())
      .patch('/contracts/bulk-approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ids })
      .expect(200);
    expect(res.body.data.approvedCount).toBe(2);

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const statuses = listRes.body.data.map((c: any) => c.status).sort();
    expect(statuses).toEqual(['APPROVED', 'SUPERSEDED']);
  });

  it('ids를 생략하면 현재 PENDING_APPROVAL 전체가 대상이 되어야 한다', async () => {
    const styleNo = `BULK-CASE3-${Date.now()}`;
    await createStyleWithContracts(styleNo, 0);

    const res = await request(app.getHttpServer())
      .patch('/contracts/bulk-approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(200);

    // 다른 테스트들이 먼저 만든 PENDING 건이 이미 없을 수 있으므로 정확한 총량은
    // 알 수 없지만, 최소한 이번에 만든 건은 포함되어 approvedCount > 0이어야 한다.
    expect(res.body.data.approvedCount).toBeGreaterThan(0);

    const listRes = await request(app.getHttpServer())
      .get('/contracts')
      .query({ styleNo })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(listRes.body.data.every((c: any) => c.status === 'APPROVED')).toBe(true);
  });

  it('일부 id가 이미 처리된 계약이면 나머지는 계속 승인되고, failed 배열에 사유가 담겨야 한다', async () => {
    const styleNoOk = `BULK-CASE4-OK-${Date.now()}`;
    const okIds = await createStyleWithContracts(styleNoOk, 0);

    const styleNoRejected = `BULK-CASE4-REJ-${Date.now()}`;
    const rejIds = await createStyleWithContracts(styleNoRejected, 0);
    await request(app.getHttpServer())
      .patch(`/contracts/${rejIds[0]}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch('/contracts/bulk-approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ids: [...okIds, ...rejIds, 999999] })
      .expect(200);

    expect(res.body.data.approvedCount).toBe(okIds.length);
    expect(res.body.data.failed).toHaveLength(2);
    expect(res.body.data.failed.some((f: any) => f.id === rejIds[0] && f.reason.includes('이미 처리된 계약'))).toBe(true);
    expect(res.body.data.failed.some((f: any) => f.id === 999999 && f.reason.includes('찾을 수 없습니다'))).toBe(true);
  });
});
