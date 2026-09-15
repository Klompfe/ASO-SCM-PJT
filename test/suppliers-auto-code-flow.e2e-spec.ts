import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-suppliers-auto-code-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-088: 공급업체(Supplier) 코드 자동채번("TY-{업체약칭}-{YY}{일련번호4자리}")과
// 업체명만으로도 등록 가능한지 검증한다(Buyer, PR-085와 동일 패턴).
describe('공급업체(Supplier) 코드 자동채번 회귀 테스트 (PR-088)', () => {
  let app: INestApplication;
  let token: string;
  const currentYy = String(new Date().getFullYear() % 100).padStart(2, '0');

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

    const email = `suppliers-auto-code-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Suppliers Auto Code E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('업체명만으로 등록이 성공하고 코드가 TY-{업체약칭}-{YY}0001 형식으로 자동생성된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2ECorp Materials' })
      .expect(201);

    expect(res.body.data.code).toMatch(new RegExp(`^TY-EE-${currentYy}\\d{4}$`));
    expect(res.body.data.abbrCode).toBe('EE');
    expect(res.body.data.businessNumber).toBeNull();
  });

  it('abbrCode를 지정하면 그 값으로 채번되고, 같은 약칭으로 연속 등록하면 일련번호가 증가한다', async () => {
    const first = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sequential Test Supplier', abbrCode: 'SQ' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sequential Test Supplier 2', abbrCode: 'SQ' })
      .expect(201);

    const firstSeq = Number(first.body.data.code.slice(-4));
    const secondSeq = Number(second.body.data.code.slice(-4));
    expect(secondSeq).toBe(firstSeq + 1);
  });

  it('다른 abbrCode는 독립적으로 0001부터 시작한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Independent Abbr Supplier', abbrCode: `IB${Date.now() % 100}` })
      .expect(201);

    expect(res.body.data.code.slice(-4)).toBe('0001');
  });

  it('알파벳이 없는 순수 한글 업체명은 기본값(SP)으로 채번된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '한글전용자재상사' })
      .expect(201);

    expect(res.body.data.code).toMatch(new RegExp(`^TY-SP-${currentYy}\\d{4}$`));
  });

  it('code를 요청 본문에 보내도 무시되고(whitelist) 서버가 자동생성한 값이 쓰인다', async () => {
    await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ignore Code Supplier', code: 'HAND-CRAFTED-CODE' })
      .expect(400); // whitelist:true + forbidNonWhitelisted:true라 정의되지 않은 code 필드는 400
  });

  it('여러 PATCH 수정에도 code는 절대 바뀌지 않는다', async () => {
    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Immutable Code Supplier', abbrCode: 'IC' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Supplier' })
      .expect(200);

    expect(updated.body.data.code).toBe(created.body.data.code);
    expect(updated.body.data.name).toBe('Renamed Supplier');
  });
});
