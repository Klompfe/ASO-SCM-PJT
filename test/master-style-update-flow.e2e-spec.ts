import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-master-style-update-flow.sqlite');
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

// PR-141: PATCH /master-styles/:styleNo — 스타일 정보 수정(등록 시 받는 필드 중 styleNo만 제외).
describe('MasterStyle 수정 (PR-141)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

  const auth = (r: request.Test, token: string) => r.set('Authorization', `Bearer ${token}`);
  const post = (url: string, token = managerToken) => auth(request(app.getHttpServer()).post(url), token);
  const patch = (url: string, token = managerToken) => auth(request(app.getHttpServer()).patch(url), token);
  const get = (url: string, token = managerToken) => auth(request(app.getHttpServer()).get(url), token);

  const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
    const password = 'password123!';
    await request(app.getHttpServer()).post('/auth/register').send({ email, password, name: 'Style Update Tester' }).expect(201);
    if (role) await dataSource.getRepository(User).update({ email }, { role });
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    return loginRes.body.data.accessToken;
  };

  const createStyle = async (styleNo: string) => {
    await post('/master-styles').send({
      styleNo, factory: '베트남', buyer: '미도컴퍼니', totalQty: 700, brand: 'ASO', itemType: 'TOP',
      productionType: 'FOB', targetRdd: '2026-12-01', cmtPrice: 5.5, fobPrice: 10,
    }).expect(201);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const stamp = Date.now();
    userToken = await registerAndLogin(`style-update-user-${stamp}@test.com`);
    managerToken = await registerAndLogin(`style-update-manager-${stamp}@test.com`, UserRole.MANAGER);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('USER 권한으로 PATCH하면 403이다', async () => {
    const styleNo = `UPD-FLOW-${Date.now()}`;
    await createStyle(styleNo);
    await patch(`/master-styles/${styleNo}`, userToken).send({ factory: '캄보디아' }).expect(403);
  });

  it('존재하지 않는 styleNo면 404이다', async () => {
    await patch('/master-styles/NO-SUCH-STYLE-EVER').send({ factory: 'x' }).expect(404);
  });

  it('MANAGER 권한으로 일부 필드만 보내면 그 필드만 바뀌고 나머지는 유지된다', async () => {
    const styleNo = `UPD-FLOW-PARTIAL-${Date.now()}`;
    await createStyle(styleNo);

    await patch(`/master-styles/${styleNo}`).send({ factory: '캄보디아', totalQty: 900 }).expect(200);

    const listed = (await get('/master-styles').query({ styleNo }).expect(200)).body.data;
    const found = listed.find((s: any) => s.styleNo === styleNo);
    expect(found.overview.factory).toBe('캄보디아');
    expect(Number(found.overview.totalQty)).toBe(900);
    expect(found.overview.buyer).toBe('미도컴퍼니'); // 안 보낸 필드는 그대로
    expect(found.overview.itemType).toBe('TOP');
  });

  it('targetRdd/생산유형(productionType)도 바뀐다', async () => {
    const styleNo = `UPD-FLOW-FULL-${Date.now()}`;
    await createStyle(styleNo);

    await patch(`/master-styles/${styleNo}`).send({ targetRdd: '2027-05-01', productionType: 'CMT', cmtPrice: 7.2 }).expect(200);

    const listed = (await get('/master-styles').query({ styleNo }).expect(200)).body.data;
    const found = listed.find((s: any) => s.styleNo === styleNo);
    expect(found.overview.targetRdd).toContain('2027-05-01');
    expect(found.overview.productionType).toBe('CMT');
  });

  it('styleNo를 바디에 넣어 보내면(변경 시도) 400으로 거부된다(ValidationPipe forbidNonWhitelisted)', async () => {
    const styleNo = `UPD-FLOW-NOCHANGE-${Date.now()}`;
    await createStyle(styleNo);

    await patch(`/master-styles/${styleNo}`).send({ styleNo: 'HACKED-STYLE-NO', factory: '베트남' }).expect(400);

    // 실제로 바뀌지 않았어야 한다(거부된 요청이므로).
    const listed = (await get('/master-styles').query({ styleNo }).expect(200)).body.data;
    expect(listed.find((s: any) => s.styleNo === styleNo)).toBeTruthy();
    expect(listed.find((s: any) => s.styleNo === 'HACKED-STYLE-NO')).toBeUndefined();
  });

  it('빈 바디({})로 보내도 200이고 값은 그대로다', async () => {
    const styleNo = `UPD-FLOW-EMPTY-${Date.now()}`;
    await createStyle(styleNo);

    await patch(`/master-styles/${styleNo}`).send({}).expect(200);

    const listed = (await get('/master-styles').query({ styleNo }).expect(200)).body.data;
    const found = listed.find((s: any) => s.styleNo === styleNo);
    expect(found.overview.factory).toBe('베트남');
  });
});
