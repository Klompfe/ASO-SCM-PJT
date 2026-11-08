import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-items-search-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-232: "품목 마스터 관리"의 품목명/코드 검색이 0건만 돌려준다는 사용자 보고 재현 —
// 합성 품목을 만들어 이름 일부/코드 전체/코드 일부/구분 필터/결과 없음 시나리오를
// 실제 API(GET /items)로 검증한다. 운영 DB는 전혀 쓰지 않는다(sqlite 테스트 DB만).
describe('품목 검색(GET /items keyword/type) 회귀 테스트 (PR-232)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `items-search-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Items Search E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    // 합성 품목(사용자 보고 재현용 이름/코드) — 실제 업무 데이터 아님.
    await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'MAT-TEST1', name: '테스트원단', type: 'RAW_MATERIAL' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'MAT-TEST2', name: '다데테스트', type: 'RAW_MATERIAL' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'FIN-TEST1', name: '테스트완제품', type: 'FINISHED_GOOD' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('이름 일부로 검색하면(부분일치) 일치하는 품목이 나온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: '다데' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.name)).toContain('다데테스트');
  });

  it('코드 전체로 검색하면 일치하는 품목이 나온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: 'MAT-TEST1' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.code)).toContain('MAT-TEST1');
  });

  it('코드 일부로 검색해도 나온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: 'TEST2' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.code)).toContain('MAT-TEST2');
  });

  it('구분(type) 필터만 줘도 그 구분의 품목이 나온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ type: 'FINISHED_GOOD' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.name)).toContain('테스트완제품');
    expect(res.body.data.items.map((i: any) => i.name)).not.toContain('테스트원단');
  });

  it('실제로 없는 키워드면 0건이 맞다(진짜 결과 없음과 버그를 구분)', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: '존재하지않는키워드ZZZ999' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('이름/코드 둘 다로 OR 매칭된다 — 괄호 누락으로 AND에 묶여 0건이 되지 않는다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: '테스트원단' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.name)).toContain('테스트원단');
  });

  // PR-232: 검색어 앞뒤에 공백이 섞여 들어와도(복사·붙여넣기 등) 매칭되어야 한다 —
  // 트림 없이는 LIKE 패턴이 "% 다데 %"(공백 포함)가 되어 "다데테스트"(앞뒤에 공백이
  // 없음)와 매칭되지 않는다. 고치기 전 코드에서는 이 테스트가 실패했다.
  it('검색어 앞뒤 공백은 트림되어 매칭된다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: '  다데  ' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.name)).toContain('다데테스트');
  });

  // PR-232: Postgres의 LIKE는 대소문자를 구분한다(sqlite는 ASCII만 자동으로 구분하지
  // 않아 이 차이가 테스트 DB에서는 가려져 있었다) — 코드 검색은 대소문자를 가리지
  // 않아야 한다. LOWER() 비교로 두 DB에서 같은 결과가 나오는지 명시적으로 확인한다.
  it('코드 검색은 대소문자를 가리지 않는다(소문자로 검색해도 매칭)', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ keyword: 'mat-test1' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.map((i: any) => i.code)).toContain('MAT-TEST1');
  });

  // PR-232: 구분도 키워드도 비우고 "검색"을 눌러도(화면의 기본 호출) 전체 목록이
  // 나와야 한다 — 서버 쪽은 원래도 조건이 없으면 전체를 돌려준다(프런트가 토스트로
  // 막던 것이 문제였다, ItemsManager.tsx 참고). 서버 계약을 명시적으로 고정해 둔다.
  it('구분·키워드 둘 다 비우면(아무 조건 없음) 전체 목록(첫 페이지)을 돌려준다', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .query({ page: 1, limit: 10 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });
});
