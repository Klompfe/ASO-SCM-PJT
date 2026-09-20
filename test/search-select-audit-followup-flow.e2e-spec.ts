import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-search-select-audit-followup-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Item } from '../src/items/entities/item.entity';

// PR-127: 조회 UI 감사 후속 — 작업지시/발주/생산계약/공급업체/거래처의 keyword 검색과 발주 skip/take(실제 적용) 회귀 방지.
describe('조회 UI 감사 후속: keyword 검색 + 페이지네이션 (PR-127)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

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
    dataSource = app.get(DataSource);
    const email = `search-audit-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Search Audit' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('작업지시 keyword (BOM 소요명세서의 100건 캡)', () => {
    let targetWoId: number;

    beforeAll(async () => {
      // 가장 오래된 작업지시 1건(검색 대상) + 이후 105건 — 최신순 limit 100 목록에는 가장 오래된 건이 들어오지 못한다.
      const target = (await post('/items').send({ code: 'WOFG-TARGET', name: '작업지시검색 Target 완제품', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      await dataSource.getRepository(Item).update({ id: target.id }, { styleNo: 'WO-STYLE-TGT' });
      const filler = (await post('/items').send({ code: 'WOFG-FILLER', name: '작업지시검색 필러 완제품', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      targetWoId = (await post('/work-orders').send({ itemId: target.id, targetQuantity: 1 }).expect(201)).body.data.id;
      for (let i = 0; i < 105; i++) {
        await post('/work-orders').send({ itemId: filler.id, targetQuantity: 1 }).expect(201);
      }
    });

    it('버그 재현: page 1 / limit 100 목록에는 가장 오래된 작업지시가 없다(기존 select로는 선택 불가)', async () => {
      const res = (await get('/work-orders?page=1&limit=100').expect(200)).body.data;
      expect(res.items).toHaveLength(100);
      expect(res.meta.total).toBeGreaterThanOrEqual(106);
      expect(res.items.some((w: any) => w.id === targetWoId)).toBe(false);
    });

    it('수정 확인: 품목명/코드/스타일번호 keyword로 100건 밖의 작업지시도 찾아진다(대소문자 무시)', async () => {
      for (const kw of ['target', 'WOFG-TARGET', 'wo-style-tgt']) {
        const res = (await get(`/work-orders?keyword=${encodeURIComponent(kw)}&limit=20`).expect(200)).body.data;
        expect(res.items.map((w: any) => w.id)).toEqual([targetWoId]);
        expect(res.items[0].item.code).toBe('WOFG-TARGET');
      }
    });

    it('결과 없는 keyword는 빈 목록과 total 0을 돌려준다', async () => {
      const res = (await get(`/work-orders?keyword=${encodeURIComponent('존재하지않는검색어')}`).expect(200)).body.data;
      expect(res.items).toEqual([]);
      expect(res.meta.total).toBe(0);
    });
  });

  describe('발주 skip/take (PR-127에서 고친 실제 버그) + keyword', () => {
    const poIds: number[] = [];
    let alphaSupplierId: number;

    beforeAll(async () => {
      alphaSupplierId = (await post('/suppliers').send({ name: '발주검색 Alpha Textile' }).expect(201)).body.data.id;
      const betaSupplierId = (await post('/suppliers').send({ name: '발주검색 Beta Trim' }).expect(201)).body.data.id;
      const denim = (await post('/items').send({ code: 'POK-DENIM', name: '발주검색 Denim 원단', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      const button = (await post('/items').send({ code: 'POK-BTN', name: '발주검색 단추', type: 'RAW_MATERIAL' }).expect(201)).body.data.id;
      // 12건: 홀수 번째는 Alpha+Denim, 짝수 번째는 Beta+단추
      for (let i = 1; i <= 12; i++) {
        const odd = i % 2 === 1;
        const id = (
          await post('/purchase-orders').send({ supplierId: odd ? alphaSupplierId : betaSupplierId, itemId: odd ? denim : button, quantity: i, unitPrice: 1 }).expect(201)
        ).body.data.id;
        poIds.push(id);
      }
    });

    it('page/limit를 안 주면 기존처럼 전량이 반환된다(원장 리포트/전표 화면 호환)', async () => {
      const all = (await get('/purchase-orders').expect(200)).body.data;
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(12);
      expect(all.map((p: any) => p.id)).toEqual(expect.arrayContaining(poIds));
    });

    it('limit=5를 주면 실제로 5건만 최신순으로 반환된다(예전엔 limit를 줘도 전량이 반환되던 버그)', async () => {
      const page1 = (await get('/purchase-orders?page=1&limit=5').expect(200)).body.data;
      expect(page1).toHaveLength(5);
      const ids = page1.map((p: any) => p.id);
      expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
      expect(ids[0]).toBe(poIds[poIds.length - 1]);
    });

    it('page 2는 page 1과 겹치지 않고 이어서 반환된다(조인이 있어도 skip/take가 행을 중복시키지 않는다)', async () => {
      const page1 = (await get('/purchase-orders?page=1&limit=5').expect(200)).body.data.map((p: any) => p.id);
      const page2 = (await get('/purchase-orders?page=2&limit=5').expect(200)).body.data.map((p: any) => p.id);
      expect(page2).toHaveLength(5);
      expect(page1.filter((id: number) => page2.includes(id))).toEqual([]);
      expect(Math.max(...page2)).toBeLessThan(Math.min(...page1));
    });

    it('limit 100 초과는 400이다', async () => {
      await get('/purchase-orders?limit=101').expect(400);
    });

    it('keyword가 품목명/코드/공급업체명 부분일치(대소문자 무시)로 검색된다', async () => {
      const byItemName = (await get(`/purchase-orders?keyword=${encodeURIComponent('denim')}`).expect(200)).body.data;
      expect(byItemName).toHaveLength(6);
      expect(byItemName.every((p: any) => p.item.code === 'POK-DENIM')).toBe(true);

      const byItemCode = (await get('/purchase-orders?keyword=pok-btn').expect(200)).body.data;
      expect(byItemCode).toHaveLength(6);

      const bySupplier = (await get(`/purchase-orders?keyword=${encodeURIComponent('alpha textile')}`).expect(200)).body.data;
      expect(bySupplier).toHaveLength(6);
      expect(bySupplier.every((p: any) => p.supplierId === alphaSupplierId)).toBe(true);
    });

    it('keyword + limit 조합: 검색 결과 안에서 페이지네이션된다(최신 5건 밖의 발주도 검색으로 찾아진다)', async () => {
      // poIds[0]는 가장 오래된 발주(Alpha+Denim) — 최신 5건 목록에는 없지만 검색+페이지로 도달 가능해야 한다
      const latest5 = (await get('/purchase-orders?limit=5').expect(200)).body.data.map((p: any) => p.id);
      expect(latest5).not.toContain(poIds[0]);
      const page2 = (await get(`/purchase-orders?keyword=denim&page=2&limit=5`).expect(200)).body.data.map((p: any) => p.id);
      expect(page2).toEqual([poIds[0]]);
    });

    it('결과 없는 keyword는 빈 배열이다', async () => {
      expect((await get('/purchase-orders?keyword=zzzz-none').expect(200)).body.data).toEqual([]);
    });
  });

  describe('생산계약: keyword + 선택적 페이지네이션 (응답은 계속 배열)', () => {
    beforeAll(async () => {
      const mfrA = (await post('/suppliers').send({ name: '생산계약검색 Omega Garments' }).expect(201)).body.data.id;
      const mfrB = (await post('/suppliers').send({ name: '생산계약검색 Sigma Sewing' }).expect(201)).body.data.id;
      for (let i = 1; i <= 7; i++) {
        await post('/production-contracts')
          .send({
            styleNo: i <= 3 ? `PCK-ALPHA-${i}` : `PCK-BETA-${i}`,
            manufacturerId: i % 2 === 1 ? mfrA : mfrB,
            priceSource: 'PRE_AGREED',
            cmtPrice: 5,
            quantity: 100,
            contractDate: `2026-09-${String(10 + i).padStart(2, '0')}`,
          })
          .expect(201);
      }
    });

    it('아무 파라미터도 없으면 기존처럼 전량을 배열로 반환한다(다른 호출부 호환)', async () => {
      const res = (await get('/production-contracts').expect(200)).body.data;
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThanOrEqual(7);
      expect(res[0].manufacturer).toBeDefined();
    });

    it('기간 필터(from/to)만 줘도 기존과 똑같이 동작한다', async () => {
      const res = (await get('/production-contracts?from=2026-09-11&to=2026-09-13').expect(200)).body.data;
      expect(res.map((c: any) => c.styleNo).sort()).toEqual(['PCK-ALPHA-1', 'PCK-ALPHA-2', 'PCK-ALPHA-3']);
    });

    it('keyword가 스타일번호/제조사명 부분일치(대소문자 무시)로 검색된다', async () => {
      const byStyle = (await get('/production-contracts?keyword=pck-alpha').expect(200)).body.data;
      expect(byStyle).toHaveLength(3);
      const byMfr = (await get(`/production-contracts?keyword=${encodeURIComponent('omega')}`).expect(200)).body.data;
      expect(byMfr).toHaveLength(4); // 홀수 i: 1,3,5,7
      expect(byMfr.every((c: any) => c.manufacturer.name.includes('Omega'))).toBe(true);
    });

    it('keyword와 기간을 같이 주면 둘 다 만족하는 계약만 반환된다', async () => {
      const res = (await get(`/production-contracts?keyword=omega&from=2026-09-15`).expect(200)).body.data;
      expect(res.map((c: any) => c.styleNo).sort()).toEqual(['PCK-BETA-5', 'PCK-BETA-7']);
    });

    it('page/limit를 주면 페이지네이션되고 응답 형태는 여전히 배열이다', async () => {
      const page1 = (await get('/production-contracts?keyword=pck&page=1&limit=3').expect(200)).body.data;
      const page3 = (await get('/production-contracts?keyword=pck&page=3&limit=3').expect(200)).body.data;
      expect(Array.isArray(page1)).toBe(true);
      expect(page1).toHaveLength(3);
      expect(page3).toHaveLength(1);
      const plainPage = (await get('/production-contracts?page=1&limit=2').expect(200)).body.data;
      expect(plainPage).toHaveLength(2);
    });

    it('결과 없는 keyword는 빈 배열이다', async () => {
      expect((await get('/production-contracts?keyword=zzzz-none').expect(200)).body.data).toEqual([]);
    });
  });

  describe('공급업체 / 거래처 keyword', () => {
    beforeAll(async () => {
      await post('/buyers').send({ name: 'Myungbo Trading', brandCode: 'MB' }).expect(201);
      await post('/buyers').send({ name: '거래처검색 Kappa Corp', brandCode: 'KP' }).expect(201);
      await post('/suppliers').send({ name: '공급검색 Lambda Mills', abbrCode: 'LM' }).expect(201);
    });

    it('거래처: 이름/브랜드약칭/코드 부분일치(대소문자 무시), 없으면 빈 배열, keyword 없으면 전체', async () => {
      const byName = (await get('/buyers?keyword=myungbo').expect(200)).body.data;
      expect(byName).toHaveLength(1);
      expect(byName[0].name).toBe('Myungbo Trading');

      const byBrand = (await get('/buyers?keyword=kp').expect(200)).body.data;
      expect(byBrand.map((b: any) => b.name)).toContain('거래처검색 Kappa Corp');

      const byCode = (await get(`/buyers?keyword=${encodeURIComponent(byName[0].code.toLowerCase())}`).expect(200)).body.data;
      expect(byCode.map((b: any) => b.id)).toContain(byName[0].id);

      expect((await get('/buyers?keyword=zzzz-none').expect(200)).body.data).toEqual([]);
      expect((await get('/buyers').expect(200)).body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('공급업체: PR-126의 keyword가 그대로 동작한다(이름/약칭)', async () => {
      const byName = (await get('/suppliers?keyword=lambda').expect(200)).body.data;
      expect(byName.map((s: any) => s.name)).toContain('공급검색 Lambda Mills');
      const byAbbr = (await get('/suppliers?keyword=lm').expect(200)).body.data;
      expect(byAbbr.map((s: any) => s.name)).toContain('공급검색 Lambda Mills');
    });
  });
});
