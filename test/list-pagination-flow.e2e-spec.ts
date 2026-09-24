import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-list-pagination-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-128: 작업지시/품목관리 메인 목록 — 10건을 넘는 데이터를 페이지 이동으로 빠짐없이 볼 수 있다(프론트 Pagination UI가 쓰는 meta 계약 포함).
describe('목록 페이지네이션: 작업지시/품목 (PR-128)', () => {
  let app: INestApplication;
  let token: string;

  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);

  // page 1부터 hasNextPage가 false가 될 때까지 따라가며 모든 행 id를 모은다(프론트의 "다음" 버튼과 같은 동작).
  const walk = async (url: string) => {
    const ids: number[] = [];
    const pageSizes: number[] = [];
    let page = 1;
    let meta: any;
    do {
      const sep = url.includes('?') ? '&' : '?';
      const res = (await get(`${url}${sep}page=${page}&limit=10`).expect(200)).body.data;
      meta = res.meta;
      expect(meta.page).toBe(page);
      ids.push(...res.items.map((i: any) => i.id));
      pageSizes.push(res.items.length);
      page += 1;
    } while (meta.hasNextPage && page < 50);
    return { ids, pageSizes, meta };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `list-pagination-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'List Pagination' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('품목관리 목록 (25건)', () => {
    const created: number[] = [];

    beforeAll(async () => {
      for (let i = 1; i <= 25; i++) {
        const id = (await post('/items').send({ code: `PGN128-${String(i).padStart(2, '0')}`, name: `페이지품목 ${i}`, type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
        created.push(id);
      }
    });

    it('meta가 총 건수/총 페이지를 알려준다(프론트 Pagination이 쓰는 값)', async () => {
      const res = (await get('/items?keyword=PGN128&page=1&limit=10').expect(200)).body.data;
      expect(res.meta).toMatchObject({ total: 25, page: 1, limit: 10, totalPages: 3, hasNextPage: true, hasPreviousPage: false });
      expect(res.items).toHaveLength(10);
    });

    it('예전 화면(page 1 고정)은 25건 중 10건만 볼 수 있었다 — 그 밖의 15건은 페이지 이동으로만 볼 수 있다', async () => {
      const first = (await get('/items?keyword=PGN128&page=1&limit=10').expect(200)).body.data.items.map((i: any) => i.id);
      const hiddenBefore = created.filter((id) => !first.includes(id));
      expect(hiddenBefore).toHaveLength(15);
    });

    it('다음 페이지를 끝까지 따라가면 25건 전부가 중복 없이 보이고 페이지 크기는 10/10/5다', async () => {
      const { ids, pageSizes, meta } = await walk('/items?keyword=PGN128');
      expect(pageSizes).toEqual([10, 10, 5]);
      expect(new Set(ids).size).toBe(25);
      expect([...ids].sort((a, b) => a - b)).toEqual([...created].sort((a, b) => a - b));
      expect(meta).toMatchObject({ page: 3, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
    });

    it('검색 조건이 있으면 그 결과 안에서만 페이지가 나뉜다(type + keyword)', async () => {
      await post('/items').send({ code: 'PGN128-FG', name: '페이지 완제품', type: 'FINISHED_GOOD' }).expect(201);
      const raw = (await get('/items?keyword=PGN128&type=RAW_MATERIAL&page=1&limit=10').expect(200)).body.data;
      expect(raw.meta.total).toBe(25);
      const fg = (await get('/items?keyword=PGN128&type=FINISHED_GOOD&page=1&limit=10').expect(200)).body.data;
      expect(fg.meta).toMatchObject({ total: 1, totalPages: 1, hasNextPage: false });
    });

    it('전체 페이지를 넘는 page는 빈 목록이지만 meta.totalPages로 되돌아갈 곳을 알 수 있다', async () => {
      const res = (await get('/items?keyword=PGN128&type=RAW_MATERIAL&page=9&limit=10').expect(200)).body.data;
      expect(res.items).toEqual([]);
      expect(res.meta.totalPages).toBe(3);
    });

    it('결과 0건이면 totalPages 0', async () => {
      const res = (await get(`/items?keyword=${encodeURIComponent('존재하지않는품목zzz')}&page=1&limit=10`).expect(200)).body.data;
      expect(res.items).toEqual([]);
      expect(res.meta).toMatchObject({ total: 0, totalPages: 0, hasNextPage: false });
    });
  });

  describe('작업지시 목록 (23건)', () => {
    const created: number[] = [];

    beforeAll(async () => {
      const item = (await post('/items').send({ code: 'PGN128-WO-ITEM', name: '작업지시페이지 Alpha 품목', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      const other = (await post('/items').send({ code: 'PGN128-WO-OTHER', name: '작업지시페이지 Beta 품목', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      for (let i = 1; i <= 23; i++) {
        created.push((await post('/work-orders').send({ itemId: item, targetQuantity: i }).expect(201)).body.data.id);
      }
      // 다른 품목 2건 — 검색/필터가 페이지 계산에서 제외되는지 본다.
      await post('/work-orders').send({ itemId: other, targetQuantity: 1 }).expect(201);
      await post('/work-orders').send({ itemId: other, targetQuantity: 2 }).expect(201);
    });

    it('예전 화면(기본 10건)으로는 23건 중 13건이 보이지 않았다', async () => {
      const res = (await get('/work-orders').expect(200)).body.data; // 파라미터 없이 = 예전 화면의 호출
      expect(res.items).toHaveLength(10);
      expect(res.meta.total).toBe(25);
      expect(res.meta.totalPages).toBe(3);
    });

    it('meta로 다음 페이지를 끝까지 따라가면 전체 25건이 중복 없이 보인다', async () => {
      const { ids, pageSizes } = await walk('/work-orders');
      expect(pageSizes).toEqual([10, 10, 5]);
      expect(new Set(ids).size).toBe(25);
      expect(created.every((id) => ids.includes(id))).toBe(true);
    });

    it('keyword 검색 결과 안에서 페이지가 나뉜다(Alpha 품목 23건 → 10/10/3)', async () => {
      const { ids, pageSizes } = await walk(`/work-orders?keyword=${encodeURIComponent('Alpha')}`);
      expect(pageSizes).toEqual([10, 10, 3]);
      expect(new Set(ids).size).toBe(23);
    });

    it('keyword로 다른 품목만 찾으면 1페이지 2건', async () => {
      const res = (await get('/work-orders?keyword=PGN128-WO-OTHER&page=1&limit=10').expect(200)).body.data;
      expect(res.meta).toMatchObject({ total: 2, totalPages: 1 });
    });

    it('상태 필터와 함께 쓰면 필터된 총 건수 기준으로 페이지가 나뉜다', async () => {
      const done = created.slice(0, 12);
      for (const id of done) await request(app.getHttpServer()).patch(`/work-orders/${id}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'COMPLETED' }).expect(200);
      const { ids, pageSizes } = await walk('/work-orders?status=COMPLETED&keyword=Alpha');
      expect(pageSizes).toEqual([10, 2]);
      expect([...ids].sort((a, b) => a - b)).toEqual([...done].sort((a, b) => a - b));
      const pending = (await get('/work-orders?status=PENDING&page=1&limit=10').expect(200)).body.data;
      expect(pending.meta.total).toBe(13); // 23-12 + 다른 품목 2
    });

    // PR-140: 상태값이 status-codes 마스터 테이블(관리자가 추가/삭제 가능) 기준으로 바뀌면서,
    // 컴파일 시점에 고정된 enum으로는 더 이상 검증할 수 없다 — 존재하지 않는 코드로
    // 필터링해도(예: 오래전 있었다 지워진 값) 결과가 0건일 뿐 해가 없으므로 400 대신 그냥 빈
    // 목록을 돌려준다. 빈 문자열도 마찬가지로 거부하지 않고 "필터 없음"으로 취급한다
    // (buildWorkOrdersQuery가 빈 문자열을 애초에 안 보내지만, 서버도 방어적으로 안전하다).
    it('등록되지 않은 상태값이나 빈 문자열 상태는 400이 아니라 그냥 그 조건에 맞는(또는 전체) 결과를 돌려준다', async () => {
      const unknown = (await get('/work-orders?status=PLANNED').expect(200)).body.data;
      expect(unknown.items).toEqual([]);
      expect(unknown.meta.total).toBe(0);

      const empty = (await get('/work-orders?status=').expect(200)).body.data;
      expect(empty.meta.total).toBe(25); // 필터 없음 취급 — 이 describe 블록에서 생성된 전체 건수
    });

    it('전체 페이지를 넘는 page는 빈 목록 + totalPages(프론트가 마지막 페이지로 되돌아가는 근거)', async () => {
      const res = (await get('/work-orders?keyword=Alpha&page=9&limit=10').expect(200)).body.data;
      expect(res.items).toEqual([]);
      expect(res.meta.totalPages).toBe(3);
    });
  });
});
