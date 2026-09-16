import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-label-set-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-099: BOM 등록 화면의 "라벨류 기본 세트 추가" — POST /boms/label-set 호출 후
// GET /boms로 조회하면 7개 항목(수량 1)이 반영되고, 한 번 더 호출해도 중복 생성되지
// 않는지 실제 HTTP 요청으로 검증한다.
describe('BOM 라벨류 기본 세트 추가 (PR-099)', () => {
  let app: INestApplication;
  let token: string;

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

    const email = `bom-label-set-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Bom Label Set E2E' });
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

  it('아직 BOM이 없는 스타일에 호출하면 404여야 한다', async () => {
    await request(app.getHttpServer())
      .post('/boms/label-set')
      .query({ styleNo: 'NO-SUCH-STYLE-EVER' })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('BOM이 있는 스타일에 호출하면 7개 항목이 추가되고, 다시 호출해도 중복 생성되지 않는다', async () => {
    const styleNo = `PR099-E2E-${Date.now()}`;

    // 자재 1건짜리 BOM을 먼저 만들어둔다(mapping/commit).
    await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'PR099 E2E 바이어', shipDate: '' },
        bomItems: [
          { category: 'FABRIC', itemName: `PR099-FABRIC-${styleNo}`, colorCode: 'BK', spec: '', consumption: 1, requiredQty: 100 },
        ],
      })
      .expect(201);

    const firstRes = await request(app.getHttpServer())
      .post('/boms/label-set')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(firstRes.body.data.added).toHaveLength(7);
    expect(firstRes.body.data.skipped).toHaveLength(0);

    const bomRes = await request(app.getHttpServer())
      .get('/boms')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // 원래 있던 자재 1건 + 라벨류 7건 = 8건.
    expect(bomRes.body.data.items).toHaveLength(8);
    const labelItems = bomRes.body.data.items.filter((i: any) => i.category === '라벨' || i.category === '포장');
    expect(labelItems).toHaveLength(7);
    expect(labelItems.every((i: any) => Number(i.consumption) === 1)).toBe(true);

    // 다시 호출해도 전부 건너뛰고(이미 있음), BOM 항목 개수가 그대로여야 한다.
    const secondRes = await request(app.getHttpServer())
      .post('/boms/label-set')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(secondRes.body.data.added).toHaveLength(0);
    expect(secondRes.body.data.skipped).toHaveLength(7);

    const bomResAfter = await request(app.getHttpServer())
      .get('/boms')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bomResAfter.body.data.items).toHaveLength(8);
  });
});
