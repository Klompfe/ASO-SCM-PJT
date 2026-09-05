import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-auth-flow.sqlite');
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('인증/인가 회귀 테스트', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // main.ts와 동일하게 forbidNonWhitelisted까지 켜야 실제 프로덕션 검증 동작을 재현한다.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('items 컨트롤러 인증 (PR-011)', () => {
    it('토큰 없이 GET /items를 호출하면 401을 반환해야 한다', async () => {
      await request(app.getHttpServer()).get('/items').expect(401);
    });

    it('토큰 없이 POST /items를 호출해도 401을 반환해야 한다', async () => {
      await request(app.getHttpServer())
        .post('/items')
        .send({ code: 'NOAUTH', name: '무인증 시도', type: 'RAW_MATERIAL' })
        .expect(401);
    });
  });

  describe('회원가입 (PR-032)', () => {
    it('RegisterDto에 없는 필드(username)를 함께 보내면 400이어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `reg-bad-${Date.now()}@test.com`,
          username: 'should-not-be-allowed',
          password: 'password123!',
          name: 'Bad Register',
        })
        .expect(400);

      const message = res.body.message?.message ?? res.body.message;
      expect(JSON.stringify(message)).toContain('username');
    });

    it('정상 필드(email/password/name)만 보내면 회원가입이 성공해야 한다', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `reg-good-${Date.now()}@test.com`,
          password: 'password123!',
          name: 'Good Register',
        })
        .expect(201);
    });
  });

  describe('로그인 email/username 겸용 (PR-018, PR-032)', () => {
    const email = `login-flow-${Date.now()}@test.com`;
    const password = 'password123!';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, name: 'Login Flow Tester' })
        .expect(201);
    });

    it('email 필드만으로 로그인에 성공해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();
    });

    it('username 필드만으로도(회원가입 시 username 컬럼에 email과 동일한 값이 저장되므로) 같은 계정으로 로그인에 성공해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: email, password })
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();

      // 새 유저가 auto-seed로 생성된 게 아니라 기존 유저와 매칭됐는지 JWT sub로 확인한다.
      const emailLoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201);

      const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      expect(decode(res.body.data.accessToken).sub).toBe(decode(emailLoginRes.body.data.accessToken).sub);
    });
  });
});
