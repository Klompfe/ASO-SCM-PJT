import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-rbac-flow.sqlite');
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

// RolesGuard가 실제로 걸려 있는 DELETE /items/clear/all을 대상으로, USER 권한으로는
// 막히고 MANAGER 권한으로는 통과하는지 검증한다(PR-065 — 지금까지 이 가드는 어떤
// 라우트에도 적용된 적 없는 죽은 코드였다).
describe('RBAC(RolesGuard) 회귀 테스트 (PR-065)', () => {
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
      .send({ email, password, name: 'RBAC Tester' })
      .expect(201);

    // 회원가입 API는 role을 받지 않는다(항상 기본값 USER) — MANAGER 계정은
    // 공개 API로 만들 수 없으므로 테스트에서 직접 리포지토리로 role을 올린다.
    if (role) {
      await dataSource.getRepository(User).update({ email }, { role });
    }

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return loginRes.body.data.accessToken;
  };

  it('JWT payload와 req.user에 role이 실제로 채워져야 한다', async () => {
    const email = `rbac-payload-${Date.now()}@test.com`;
    const token = await registerAndLogin(email, UserRole.MANAGER);
    const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());
    expect(decode(token).role).toBe(UserRole.MANAGER);
  });

  it('USER 권한으로 DELETE /items/clear/all을 호출하면 403이어야 한다', async () => {
    const email = `rbac-user-${Date.now()}@test.com`;
    const token = await registerAndLogin(email); // role 지정 없음 → 기본값 USER

    await request(app.getHttpServer())
      .delete('/items/clear/all')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('MANAGER 권한으로 DELETE /items/clear/all을 호출하면 정상 통과해야 한다', async () => {
    const email = `rbac-manager-${Date.now()}@test.com`;
    const token = await registerAndLogin(email, UserRole.MANAGER);

    await request(app.getHttpServer())
      .delete('/items/clear/all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('role 지정 없는 기존 라우트(GET /items)는 인증만 되면 그대로 통과해야 한다', async () => {
    const email = `rbac-regression-${Date.now()}@test.com`;
    const token = await registerAndLogin(email); // USER

    await request(app.getHttpServer())
      .get('/items')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
