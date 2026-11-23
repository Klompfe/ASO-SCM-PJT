import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-outer-fabric-audit-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';

// PR-256: 겉감 혼용률 점검 목록(GET /boms/outer-fabric-audit) — 실 DB(SQLite)로 원시 컬럼 매핑·판정·필터를 확인하고 읽기 전용임을 행 수로 확인한다.
describe('겉감 혼용률 점검 목록 (PR-256)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (q = '') => auth(request(app.getHttpServer()).get(`/boms/outer-fabric-audit${q}`));
  const commit = (styleNo: string, bomItems: any[]) =>
    auth(request(app.getHttpServer()).post('/mapping/commit')).send({ styleNo, overviewData: { styleNo, factory: '베트남', totalQty: 10, buyer: '바이어A' }, bomItems }).expect(201);
  const line = (itemName: string, category: string, composition?: string) => ({ category, itemName, colorCode: 'BK', spec: 'S', consumption: 1, requiredQty: 10, ...(composition ? { composition } : {}) });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `outer-audit-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Outer Audit' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    await commit('AUD-OK', [line('AUD-겉감A', '겉감', 'WOOL 60% NYLON 40%'), line('AUD-안감A', '안감', 'POLYESTER 100%')]);
    await commit('AUD-NOROW', [line('AUD-안감B', '안감', 'POLYESTER 100%'), line('AUD-심지B', 'INTERLINING')]);
    await commit('AUD-BLANK', [line('AUD-겉감C', '겉감 OUT-SHELL'), line('AUD-안감C', '안감', 'POLYESTER 100%')]);
    await commit('AUD-FABRIC', [line('AUD-원단D', 'FABRIC', 'COTTON 100%')]);
    await commit('AUD-NOBOM', []);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('겉감 행 없음·혼용률 비어 있음·BOM 없음 스타일만 나오고, 채워진 스타일은 제외된다', async () => {
    const res = (await get().expect(200)).body.data;
    const byNo = Object.fromEntries(res.items.map((i: any) => [i.styleNo, i]));
    expect(byNo['AUD-OK']).toBeUndefined();
    expect(byNo['AUD-NOROW']).toMatchObject({ status: 'noRow', outerRowCount: 0, totalRows: 2 });
    expect(byNo['AUD-BLANK']).toMatchObject({ status: 'blank', outerRowCount: 1, blankOuterRows: 1, totalRows: 2 });
    expect(byNo['AUD-FABRIC']).toMatchObject({ status: 'noRow' });
    expect(byNo['AUD-FABRIC'].categories).toEqual(['FABRIC']);
    expect(byNo['AUD-NOBOM']).toMatchObject({ status: 'noBom', totalRows: 0 });
    expect(res.counts).toEqual({ noBom: 1, noRow: 2, blank: 1, total: 4 });
    expect(res.styleCount).toBe(5);
    expect(res.items.map((i: any) => i.status)).toEqual(['noRow', 'noRow', 'blank', 'noBom']); // 정렬: noRow → blank → noBom
  });

  it('상태 필터·검색·페이지가 적용되고 잘못된 값은 400', async () => {
    expect((await get('?status=blank').expect(200)).body.data.items.map((i: any) => i.styleNo)).toEqual(['AUD-BLANK']);
    expect((await get('?q=nobom').expect(200)).body.data.items.map((i: any) => i.styleNo)).toEqual(['AUD-NOBOM']);
    const paged = (await get('?page=2&pageSize=2').expect(200)).body.data;
    expect(paged.items).toHaveLength(2);
    expect(paged.total).toBe(4);
    await get('?status=bad').expect(400);
    await get('?pageSize=1000').expect(400);
  });

  it('조회는 읽기 전용이다 — BOM·행 수가 그대로이고, 겉감 행을 추가·입력한 스타일은 목록에서 사라진다', async () => {
    const before = [await dataSource.getRepository(Bom).count(), await dataSource.getRepository(BomItem).count()];
    await get().expect(200);
    await get('?status=noRow').expect(200);
    expect([await dataSource.getRepository(Bom).count(), await dataSource.getRepository(BomItem).count()]).toEqual(before);

    await commit('AUD-NOROW', [line('AUD-겉감B2', '겉감', 'WOOL 100%')]); // 재업로드로 겉감 행 추가
    const after = (await get().expect(200)).body.data;
    expect(after.items.find((i: any) => i.styleNo === 'AUD-NOROW')).toBeUndefined();
  });

  it('로그인하지 않으면 401', async () => {
    await request(app.getHttpServer()).get('/boms/outer-fabric-audit').expect(401);
  });
});
