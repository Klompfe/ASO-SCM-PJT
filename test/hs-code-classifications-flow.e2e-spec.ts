import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-hs-code-classifications-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

const TEST_API_KEY = 'test-hs-code-lookup-api-key-e2e';
process.env.HS_CODE_LOOKUP_API_KEY = TEST_API_KEY;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User, UserRole } from '../src/users/entities/user.entity';

const HEADER = ['No.', 'Style No.', 'Item', '재직', '혼용률', 'HS. CODE', '관,부가세 유무'];

function buildWorkbook(rows: Array<Array<string | number>>): Buffer {
  const ws = xlsx.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('HS코드 분류(HsCodeClassification) 회귀 테스트 (PR-081)', () => {
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

    const userEmail = `hscode-e2e-user-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123!', name: 'HsCode E2E User' });
    userToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    const managerEmail = `hscode-e2e-manager-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: managerEmail, password: 'password123!', name: 'HsCode E2E Manager' });
    await dataSource
      .getRepository(User)
      .update({ email: managerEmail }, { role: UserRole.ADMIN });
    managerToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: managerEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('POST /hs-code-classifications/import 권한', () => {
    it('일반 사용자(USER)는 임포트가 거부(403)되어야 한다', async () => {
      const buffer = buildWorkbook([
        [1, 'STY-RBAC-1', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', ''],
      ]);

      await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', buffer, 'hscode.xlsx')
        .expect(403);
    });

    it('토큰 없이 호출하면 401이어야 한다', async () => {
      const buffer = buildWorkbook([
        [1, 'STY-RBAC-2', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', ''],
      ]);

      await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .attach('file', buffer, 'hscode.xlsx')
        .expect(401);
    });

    it('MANAGER는 임포트에 성공해야 한다', async () => {
      const buffer = buildWorkbook([
        [1, 'STY-OK-1', "WOMEN'S JACKET", '직물', 'WOOL 98%', '6202.20.1000', '관세 유'],
        [2, 'STY-OK-2', "WOMEN'S COAT", '직물', 'COTTON 100%', '6202.10.0000', ''],
      ]);

      const res = await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', buffer, 'hscode.xlsx')
        .expect(201);

      expect(res.body.data.totalRows).toBe(2);
      expect(res.body.data.created).toBe(2);
      expect(res.body.data.updated).toBe(0);
      expect(res.body.data.conflicts).toEqual([]);
    });
  });

  describe('임포트 충돌(conflict) 감지', () => {
    it('같은 조합에 다른 HS코드가 재임포트되면 conflicts에 기록하고 덮어써야 한다', async () => {
      const first = buildWorkbook([
        [1, 'STY-CONFLICT-1', "WOMEN'S PANTS", '직물', 'COTTON 100%', '6204.62.0000', ''],
      ]);
      await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', first, 'first.xlsx')
        .expect(201);

      const second = buildWorkbook([
        [1, 'STY-CONFLICT-2', "WOMEN'S PANTS", '직물', 'COTTON 100%', '6204.62.9000', ''],
      ]);
      const res = await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', second, 'second.xlsx')
        .expect(201);

      expect(res.body.data.updated).toBe(1);
      expect(res.body.data.conflicts).toEqual([
        {
          itemType: "WOMEN'S PANTS",
          fabricType: '직물',
          composition: 'COTTON 100%',
          previousHsCode: '6204.62.0000',
          newHsCode: '6204.62.9000',
        },
      ]);

      const lookupRes = await request(app.getHttpServer())
        .get('/hs-code-classifications/lookup')
        .set('x-api-key', TEST_API_KEY)
        .query({ itemType: "WOMEN'S PANTS", fabricType: '직물', composition: 'COTTON 100%' })
        .expect(200);
      expect(lookupRes.body.data.hsCode).toBe('6204.62.9000');
    });
  });

  describe('외부 API키 인증 (Python 수입통관 이메일 에이전트용)', () => {
    beforeAll(async () => {
      const buffer = buildWorkbook([
        [1, 'STY-APIKEY-1', "WOMEN'S SKIRT", '직물', 'POLYESTER 100%', '6204.53.0000', ''],
      ]);
      await request(app.getHttpServer())
        .post('/hs-code-classifications/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', buffer, 'apikey.xlsx')
        .expect(201);
    });

    it('JWT 없이 x-api-key만으로 lookup을 호출할 수 있어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/hs-code-classifications/lookup')
        .set('x-api-key', TEST_API_KEY)
        .query({ itemType: "WOMEN'S SKIRT", fabricType: '직물', composition: 'POLYESTER 100%' })
        .expect(200);

      expect(res.body.data.hsCode).toBe('6204.53.0000');
    });

    it('JWT 없이 x-api-key만으로 by-style을 호출할 수 있어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/hs-code-classifications/by-style/STY-APIKEY-1')
        .set('x-api-key', TEST_API_KEY)
        .expect(200);

      expect(res.body.data.hsCode).toBe('6204.53.0000');
    });

    it('잘못된 API 키는 401로 거부되어야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/lookup')
        .set('x-api-key', 'wrong-key')
        .query({ itemType: "WOMEN'S SKIRT", fabricType: '직물', composition: 'POLYESTER 100%' })
        .expect(401);
    });

    it('API 키 헤더가 아예 없으면 401로 거부되어야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/by-style/STY-APIKEY-1')
        .expect(401);
    });

    it('존재하지 않는 조합은 API키가 맞아도 404여야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/lookup')
        .set('x-api-key', TEST_API_KEY)
        .query({ itemType: 'NO SUCH ITEM', fabricType: '직물', composition: 'NONE' })
        .expect(404);
    });

    it('존재하지 않는 styleNo는 API키가 맞아도 404여야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/by-style/NO-SUCH-STYLE')
        .set('x-api-key', TEST_API_KEY)
        .expect(404);
    });
  });

  describe('GET /hs-code-classifications 목록/검색 (내부 JWT 인증)', () => {
    it('로그인한 일반 사용자도 목록을 조회할 수 있어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/hs-code-classifications')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ itemType: "WOMEN'S SKIRT" })
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.items.every((i: any) => i.itemType === "WOMEN'S SKIRT"),
      ).toBe(true);
    });
  });

  describe('POST /hs-code-classifications 수동 등록', () => {
    it('일반 사용자는 거부(403)되어야 한다', async () => {
      await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          itemType: "WOMEN'S MUFFLER",
          fabricType: '직물',
          composition: 'WOOL 100%',
          hsCode: '6214.20.0000',
        })
        .expect(403);
    });

    it('MANAGER는 수동 등록할 수 있어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          itemType: "WOMEN'S MUFFLER",
          fabricType: '직물',
          composition: 'WOOL 100%',
          hsCode: '6214.20.0000',
          note: '관세 무',
        })
        .expect(201);

      expect(res.body.data.hsCode).toBe('6214.20.0000');
    });
  });

  describe('PR-084: 등록 시 styleNo 매핑 및 GET /style/:styleNo 조회', () => {
    it('POST 등록 시 styleNo를 지정하면 매핑도 함께 저장되고 응답에 styleNo가 포함된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          itemType: "WOMEN'S VEST",
          fabricType: '직물',
          composition: 'WOOL 100%',
          hsCode: '6211.42.0000',
          styleNo: 'STY-VEST-01',
        })
        .expect(201);

      expect(res.body.data.styleNo).toBe('STY-VEST-01');

      const findRes = await request(app.getHttpServer())
        .get('/hs-code-classifications/style/STY-VEST-01')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(findRes.body.data.hsCode).toBe('6211.42.0000');
    });

    it('styleNo 없이 등록해도 정상 동작한다(기존 흐름 유지)', async () => {
      const res = await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          itemType: "WOMEN'S DRESS",
          fabricType: '직물',
          composition: 'SILK 100%',
          hsCode: '6204.43.0000',
        })
        .expect(201);

      expect(res.body.data.styleNo).toBeNull();
    });

    it('기존 styleNo를 다른 조합으로 재지정하면 조회 결과가 바뀐다', async () => {
      await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          itemType: "WOMEN'S COAT",
          fabricType: '직물',
          composition: 'WOOL 90%, NYLON 10%',
          hsCode: '6202.10.0000',
          styleNo: 'STY-REASSIGN-01',
        })
        .expect(201);

      // 관세사 확인 후 다른 조합으로 정정(itemType/fabricType/composition이 바뀜)
      await request(app.getHttpServer())
        .post('/hs-code-classifications')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          itemType: "WOMEN'S JACKET",
          fabricType: '직물',
          composition: 'WOOL 80%, NYLON 20%',
          hsCode: '6204.33.0000',
          styleNo: 'STY-REASSIGN-01',
        })
        .expect(201);

      const findRes = await request(app.getHttpServer())
        .get('/hs-code-classifications/style/STY-REASSIGN-01')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(findRes.body.data.itemType).toBe("WOMEN'S JACKET");
      expect(findRes.body.data.hsCode).toBe('6204.33.0000');
    });

    it('GET /style/:styleNo는 로그인 없이 호출하면 401이어야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/style/STY-VEST-01')
        .expect(401);
    });

    it('GET /style/:styleNo는 존재하지 않는 styleNo면 404여야 한다', async () => {
      await request(app.getHttpServer())
        .get('/hs-code-classifications/style/NO-SUCH-STYLE-XYZ')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('PR-084: 목록 조회에 연결된 styleNos 포함 + styleNo 검색', () => {
    it('목록 조회 결과 각 항목에 연결된 styleNos 배열이 포함된다', async () => {
      const res = await request(app.getHttpServer())
        .get('/hs-code-classifications')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ itemType: "WOMEN'S VEST" })
        .expect(200);

      const item = res.body.data.items.find((i: any) => i.composition === 'WOOL 100%');
      expect(item.styleNos).toContain('STY-VEST-01');
    });

    it('styleNo로 부분일치 검색이 된다', async () => {
      const res = await request(app.getHttpServer())
        .get('/hs-code-classifications')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ styleNo: 'STY-VEST' })
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.every((i: any) => i.styleNos.includes('STY-VEST-01'))).toBe(true);
    });
  });
});
