import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-auth-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/users/entities/user.entity';

describe('인증/인가 회귀 테스트', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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

    dataSource = app.get(DataSource);
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

  // PR-072: "검증 실패(4xx) 응답인데 실제로는 사용자가 생성된다"는 의혹을 조사한 결과,
  // 응답 코드만 보고 끝내지 않고 매번 DB를 직접 조회해 실제 row 개수까지 확인한다 —
  // 이게 원래 버그 리포트의 핵심이었다(응답 코드만 믿지 말 것).
  describe('회원가입 실패 시 실제로 레코드가 생기지 않아야 한다 (PR-072)', () => {
    it('중복 이메일로 재가입을 시도하면 409(Conflict)이고, DB에는 여전히 1건만 있어야 한다', async () => {
      const email = `pr072-dup-${Date.now()}@test.com`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'password123!', name: 'Dup First' })
        .expect(201);

      // 여기서 400을 기대하기 쉽지만, register()의 사전 중복 검사는
      // ConflictException을 던지므로 실제로는 409가 정확한 응답이다.
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'password123!', name: 'Dup Second' })
        .expect(409);

      const rows = await dataSource.getRepository(User).find({ where: { email } });
      expect(rows.length).toBe(1);
    });

    // 동시 요청(TOCTOU race)으로 save()가 DB unique 제약 위반을 던질 때 500이 아닌
    // 409로 정확히 변환되는지는 auth.service.spec.ts의 목(mock) 기반 유닛 테스트로
    // 결정적으로 검증한다 — 실제 동시 요청으로 여기서 재현을 시도해봤으나, SQLite
    // 테스트 DB의 파일 락 특성상 두 요청 모두 실패하는 등 sqlite 자체의 동시 쓰기
    // 한계 때문에 결과가 들쭉날쭉해 신뢰할 수 있는 e2e 테스트가 되지 못했다(실제
    // Postgres/Neon 대상 curl 검증에서는 동시 요청 시 하나는 201, 하나는 409로
    // 안정적으로 재현되고 DB에는 정확히 1건만 남는 것을 확인했다).

    it('잘못된 이메일 형식으로 가입을 시도하면 400이고, DB에는 레코드가 생기지 않아야 한다', async () => {
      const email = 'not-an-email';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'password123!', name: 'Bad Email' })
        .expect(400);

      const rows = await dataSource
        .getRepository(User)
        .find({ where: [{ email } as any, { username: email } as any] });
      expect(rows.length).toBe(0);
    });

    it('너무 짧은 비밀번호로 가입을 시도하면 400이고, DB에는 레코드가 생기지 않아야 한다', async () => {
      const email = `pr072-shortpw-${Date.now()}@test.com`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: '123', name: 'Short Password' })
        .expect(400);

      const rows = await dataSource.getRepository(User).find({ where: { email } });
      expect(rows.length).toBe(0);
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
