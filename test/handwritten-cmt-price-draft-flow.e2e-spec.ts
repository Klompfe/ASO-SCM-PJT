import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-handwritten-cmt-price-draft-flow.sqlite');
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

// PR-181: 미도 작지 수기 CMT단가 — 초안 입력(수정+코멘트) → 계약 승인 시 최종 확정.
// 수주 등록(commit-analysis)이 cmtPrice를 받으면(AI는 채우지 않으므로 항상 사람이 입력한
// 값) 계약을 HANDWRITTEN_DRAFT로 만들고, 승인 시점에 금액을 다시 확인·입력해야만 승인된다.
describe('미도 수기 CMT단가 초안 → 계약 승인 확정 (PR-181)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
    await request(app.getHttpServer()).post('/auth/register').send({ email, password, name: 'CMT Draft Tester' }).expect(201);
    if (role) await dataSource.getRepository(User).update({ email }, { role });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    return res.body.data.accessToken;
  };

  const buildPayload = (styleNo: string, overrides: Record<string, unknown> = {}) => ({
    overview: {
      styleNo, styleName: null, itemType: 'JK', brand: null, productionType: 'CMT', factory: '베트남',
      buyer: '미도컴퍼니', totalQty: 100, targetRdd: null, documentDate: null,
      handwrittenCmtPriceCandidate: null, handwrittenCmtPriceMemo: null, cmtPrice: null, cmtPriceNote: null,
      ...overrides,
    },
    bomItems: [{ category: 'FABRIC', itemName: `${styleNo}-원단`, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
    sizeSpecs: [],
    workNotes: null,
  });

  let managerToken: string;
  const tag = Date.now();

  beforeAll(async () => {
    managerToken = await registerAndLogin(`cmt-draft-manager-${tag}@test.com`, UserRole.MANAGER);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${managerToken}`);

  it('수기 초안(cmtPrice+코멘트)으로 등록하면 계약이 HANDWRITTEN_DRAFT로 생성된다', async () => {
    const styleNo = `CMT-DRAFT-A-${tag}`;
    await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(
      buildPayload(styleNo, { handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: '7,270 + 230 = 7,500', cmtPrice: 7500, cmtPriceNote: '작지 수기: 7,270 + 230 = 7,500' }),
    ).expect(201);

    const list = await auth(request(app.getHttpServer()).get('/contracts').query({ styleNo })).expect(200);
    const contract = list.body.data[0];
    expect(Number(contract.cmtPrice)).toBe(7500);
    expect(contract.cmtPriceConfidence).toBe('HANDWRITTEN_DRAFT');
    expect(contract.cmtPriceNote).toBe('작지 수기: 7,270 + 230 = 7,500');
  });

  it('HANDWRITTEN_DRAFT 계약은 cmtPrice 없이 승인하면 400이고, 보내면 승인되며 MANUAL_CONFIRMED로 바뀌고 코멘트가 이어 붙는다', async () => {
    const styleNo = `CMT-DRAFT-B-${tag}`;
    await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(
      buildPayload(styleNo, { cmtPrice: 5000, cmtPriceNote: '작지 수기: 5,000' }),
    ).expect(201);
    const contract = (await auth(request(app.getHttpServer()).get('/contracts').query({ styleNo })).expect(200)).body.data[0];

    await auth(request(app.getHttpServer()).patch(`/contracts/${contract.id}/approve`)).send({}).expect(400);

    const approved = await auth(request(app.getHttpServer()).patch(`/contracts/${contract.id}/approve`))
      .send({ cmtPrice: 5200, cmtPriceNote: '작지 원본 재확인, 5,200으로 확정' })
      .expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(Number(approved.body.data.cmtPrice)).toBe(5200);
    expect(approved.body.data.cmtPriceConfidence).toBe('MANUAL_CONFIRMED');
    expect(approved.body.data.cmtPriceNote).toBe('작지 수기: 5,000 | [승인] 작지 원본 재확인, 5,200으로 확정');
  });

  it('일괄승인은 HANDWRITTEN_DRAFT 건을 승인하지 않고 failed[]에 사유와 함께 담는다', async () => {
    const draftStyleNo = `CMT-DRAFT-C-${tag}`;
    const normalStyleNo = `CMT-DRAFT-D-${tag}`;
    await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(
      buildPayload(draftStyleNo, { cmtPrice: 3000, cmtPriceNote: '작지 수기: 3,000' }),
    ).expect(201);
    await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(
      buildPayload(normalStyleNo, {}),
    ).expect(201);
    const draftContract = (await auth(request(app.getHttpServer()).get('/contracts').query({ styleNo: draftStyleNo })).expect(200)).body.data[0];
    const normalContract = (await auth(request(app.getHttpServer()).get('/contracts').query({ styleNo: normalStyleNo })).expect(200)).body.data[0];

    const res = await auth(request(app.getHttpServer()).patch('/contracts/bulk-approve'))
      .send({ ids: [draftContract.id, normalContract.id] })
      .expect(200);

    expect(res.body.data.approvedCount).toBe(1);
    expect(res.body.data.failed).toEqual([{ id: draftContract.id, reason: '수기 CMT단가 초안 — 개별 확인 필요' }]);
  });

  it('비-미도/FOB 등 수기 초안이 아닌 계약은 cmtPrice 없이도 평소대로 승인된다(회귀 없음)', async () => {
    const styleNo = `CMT-DRAFT-FOB-${tag}`;
    await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(
      buildPayload(styleNo, { productionType: 'FOB', buyer: '일반바이어', cmtPrice: null, cmtPriceNote: null }),
    ).expect(201);
    const contract = (await auth(request(app.getHttpServer()).get('/contracts').query({ styleNo })).expect(200)).body.data[0];
    expect(contract.cmtPriceConfidence).toBeNull();

    const approved = await auth(request(app.getHttpServer()).patch(`/contracts/${contract.id}/approve`)).send({}).expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
  });
});
