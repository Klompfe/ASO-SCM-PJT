import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-supplier-buyer-optional-email-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-149: email이 선택 필드(@IsOptional())인데도, 프론트가 실제로 보내는 email: ''(빈 문자열)가
// @IsEmail()에 그대로 걸려 "유효한 이메일 형식이 아닙니다"로 등록 자체가 막히던 버그.
// 공급업체/고객사 둘 다 같은 패턴(@IsOptional() + @IsEmail())이라 함께 검증한다.
describe('공급업체/고객사 등록·수정 — email 빈 값 허용 (PR-149)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `optional-email-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Optional Email E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const post = (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);
  const patch = (url: string) => request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`);

  describe.each([
    { label: '공급업체', url: '/suppliers', nameField: 'name', nameValue: '(주) 글로벌 자재' },
    { label: '고객사', url: '/buyers', nameField: 'name', nameValue: '(주) 미도컴퍼니' },
  ])('$label', ({ url, nameField, nameValue }) => {
    it('email 없이(필드 자체를 안 보냄) 업체명만으로 등록 성공', async () => {
      const res = await post(url).send({ [nameField]: `${nameValue} A` }).expect(201);
      expect(res.body.data.email).toBeNull();
    });

    it('email이 빈 문자열이어도(프론트가 실제로 보내는 값) 등록 성공', async () => {
      const res = await post(url).send({ [nameField]: `${nameValue} B`, email: '' }).expect(201);
      expect(res.body.data.email).toBeNull();
    });

    it('email 형식이 잘못되면 여전히 400으로 거절된다', async () => {
      for (const bad of ['abc', 'abc@']) {
        const res = await post(url).send({ [nameField]: `${nameValue} C`, email: bad }).expect(400);
        expect(JSON.stringify(res.body.message)).toContain('유효한 이메일 형식이 아닙니다');
      }
    });

    it('유효한 email은 정상 등록되고 그 값이 그대로 저장된다', async () => {
      const res = await post(url).send({ [nameField]: `${nameValue} D`, email: 'contact@example.com' }).expect(201);
      expect(res.body.data.email).toBe('contact@example.com');
    });

    it('PATCH로 이미 있던 email을 빈 문자열로 지워서 저장할 수 있다', async () => {
      const created = await post(url).send({ [nameField]: `${nameValue} E`, email: 'before-clear@example.com' }).expect(201);
      expect(created.body.data.email).toBe('before-clear@example.com');

      const updated = await patch(`${url}/${created.body.data.id}`).send({ email: '' }).expect(200);
      expect(updated.body.data.email).toBeNull();
    });

    it('PATCH에서도 잘못된 email 형식은 400으로 거절된다', async () => {
      const created = await post(url).send({ [nameField]: `${nameValue} F` }).expect(201);
      await patch(`${url}/${created.body.data.id}`).send({ email: 'still-not-an-email' }).expect(400);
    });
  });
});
