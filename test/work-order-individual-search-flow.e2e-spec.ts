import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-work-order-individual-search-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-139: 작업지시 목록 화면의 품목명/품목코드/스타일번호 개별 검색 — keyword(OR)와 별개로 각각 AND 조건으로 동작해야 한다.
describe('작업지시 목록: 항목별 개별 검색 itemName/itemCode/styleNo (PR-139)', () => {
  let app: INestApplication;
  let token: string;
  let shirtWoId: number;
  let pantsWoId: number;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `wo-individual-search-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'WO Individual Search' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    const shirt = (await post('/items').send({ code: 'IND-SHIRT-01', name: '개별검색 셔츠', type: 'FINISHED_GOOD', styleNo: 'IND-STYLE-SHIRT' }).expect(201)).body.data;
    const pants = (await post('/items').send({ code: 'IND-PANTS-01', name: '개별검색 팬츠', type: 'FINISHED_GOOD', styleNo: 'IND-STYLE-PANTS' }).expect(201)).body.data;
    shirtWoId = (await post('/work-orders').send({ itemId: shirt.id, targetQuantity: 1 }).expect(201)).body.data.id;
    pantsWoId = (await post('/work-orders').send({ itemId: pants.id, targetQuantity: 1 }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('itemName만으로 검색: 그 이름을 가진 작업지시만 찾아진다', async () => {
    const res = (await get(`/work-orders?itemName=${encodeURIComponent('개별검색 셔츠')}`).expect(200)).body.data;
    expect(res.items.map((w: any) => w.id)).toEqual([shirtWoId]);
  });

  it('itemCode만으로 검색: 그 코드를 가진 작업지시만 찾아진다(대소문자 무시)', async () => {
    const res = (await get(`/work-orders?itemCode=ind-pants-01`).expect(200)).body.data;
    expect(res.items.map((w: any) => w.id)).toEqual([pantsWoId]);
  });

  it('styleNo만으로 검색: 그 스타일번호를 가진 작업지시만 찾아진다', async () => {
    const res = (await get(`/work-orders?styleNo=${encodeURIComponent('IND-STYLE-SHIRT')}`).expect(200)).body.data;
    expect(res.items.map((w: any) => w.id)).toEqual([shirtWoId]);
  });

  it('셋을 함께 주면 모두 만족하는 작업지시만 찾아진다(AND)', async () => {
    const matchAll = (await get(`/work-orders?itemName=${encodeURIComponent('개별검색 셔츠')}&itemCode=IND-SHIRT-01&styleNo=IND-STYLE-SHIRT`).expect(200)).body.data;
    expect(matchAll.items.map((w: any) => w.id)).toEqual([shirtWoId]);

    // 서로 다른 작업지시를 가리키는 조건을 섞으면 둘 다 만족할 수 없어 결과가 없다.
    const mismatch = (await get(`/work-orders?itemName=${encodeURIComponent('개별검색 셔츠')}&itemCode=IND-PANTS-01`).expect(200)).body.data;
    expect(mismatch.items).toEqual([]);
  });

  it('결과 없는 조건은 빈 목록과 total 0을 돌려준다', async () => {
    const res = (await get(`/work-orders?styleNo=${encodeURIComponent('존재하지않는스타일')}`).expect(200)).body.data;
    expect(res.items).toEqual([]);
    expect(res.meta.total).toBe(0);
  });

  it('기존 keyword 파라미터는 그대로 동작한다(하위 호환)', async () => {
    const res = (await get(`/work-orders?keyword=${encodeURIComponent('개별검색')}`).expect(200)).body.data;
    expect(res.items.map((w: any) => w.id).sort()).toEqual([shirtWoId, pantsWoId].sort());
  });
});
