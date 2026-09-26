import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-hs-code-classification-delete-flow.sqlite');
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
import { StyleHsCodeMapping } from '../src/hs-code-classifications/entities/style-hs-code-mapping.entity';

// PR-141: DELETE /hs-code-classifications/:id — style_hs_code_mappings FK가 ON DELETE
// CASCADE라 분류를 지우면 연결된 스타일 매핑도 DB가 함께 지운다(styles.service.ts의
// 스타일 삭제 cascade 방침과 일관). 매핑이 없는 분류 삭제와 있는 분류 삭제 둘 다 확인.
describe('HS코드 분류 삭제 (PR-141)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

  const auth = (r: request.Test, token: string) => r.set('Authorization', `Bearer ${token}`);
  const post = (url: string, token = managerToken) => auth(request(app.getHttpServer()).post(url), token);
  const del = (url: string, token = managerToken) => auth(request(app.getHttpServer()).delete(url), token);
  const get = (url: string, token = managerToken) => auth(request(app.getHttpServer()).get(url), token);

  const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
    const password = 'password123!';
    await request(app.getHttpServer()).post('/auth/register').send({ email, password, name: 'HsCode Delete Tester' }).expect(201);
    if (role) await dataSource.getRepository(User).update({ email }, { role });
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    return loginRes.body.data.accessToken;
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
    userToken = await registerAndLogin(`hscode-delete-user-${stamp}@test.com`);
    managerToken = await registerAndLogin(`hscode-delete-manager-${stamp}@test.com`, UserRole.ADMIN);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('USER 권한으로 삭제하면 403이다', async () => {
    const created = (await post('/hs-code-classifications').send({
      itemType: `DEL-JK-${Date.now()}`, fabricType: '직물', composition: 'WOOL 100%', hsCode: '6201.11.0000',
    }).expect(201)).body.data;
    await del(`/hs-code-classifications/${created.id}`, userToken).expect(403);
  });

  it('존재하지 않는 id면 404이다', async () => {
    await del('/hs-code-classifications/999999999').expect(404);
  });

  it('매핑이 없는 분류를 삭제하면 목록에서 사라진다', async () => {
    const itemType = `DEL-NOMAP-${Date.now()}`;
    const created = (await post('/hs-code-classifications').send({
      itemType, fabricType: '직물', composition: 'COTTON 100%', hsCode: '6202.11.0000',
    }).expect(201)).body.data;

    await del(`/hs-code-classifications/${created.id}`).expect(200);

    const list = (await get('/hs-code-classifications').query({ itemType }).expect(200)).body.data;
    expect(list.items.find((c: any) => c.id === created.id)).toBeUndefined();
  });

  it('스타일에 매핑된 분류를 삭제하면, 분류와 매핑이 둘 다 지워진다(cascade)', async () => {
    const itemType = `DEL-WITHMAP-${Date.now()}`;
    const styleNo = `DEL-WITHMAP-STYLE-${Date.now()}`;
    const created = (await post('/hs-code-classifications').send({
      itemType, fabricType: '직물', composition: 'WOOL 98%, PU 2%', hsCode: '6203.31.0000', styleNo,
    }).expect(201)).body.data;

    // 매핑이 실제로 생겼는지 먼저 확인(삭제 검증의 전제).
    const mappingBefore = await dataSource.getRepository(StyleHsCodeMapping).findOne({ where: { styleNo } });
    expect(mappingBefore).not.toBeNull();
    expect(mappingBefore!.classificationId).toBe(created.id);

    await del(`/hs-code-classifications/${created.id}`).expect(200);

    // 분류 자체가 목록에서 사라지고,
    const list = (await get('/hs-code-classifications').query({ itemType }).expect(200)).body.data;
    expect(list.items.find((c: any) => c.id === created.id)).toBeUndefined();

    // FK CASCADE로 매핑도 함께 지워졌어야 한다.
    const mappingAfter = await dataSource.getRepository(StyleHsCodeMapping).findOne({ where: { styleNo } });
    expect(mappingAfter).toBeNull();

    // by-style 조회(로그인 사용자용)도 더 이상 찾지 못해야 한다.
    await get(`/hs-code-classifications/style/${styleNo}`).expect(404);
  });
});
