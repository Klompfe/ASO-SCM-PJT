import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-active-review-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MasterStyle } from '../src/styles/entities/master-style.entity';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';
import { Item } from '../src/items/entities/item.entity';
import { User, UserRole } from '../src/users/entities/user.entity';

// PR-121: BOM 중복 검토(GET /boms/duplicates), 활성 BOM 선택(PATCH /boms/styles/:styleNo/active-bom),
// 그리고 BOM 소요명세서(PR-120)가 "가장 높은 id"가 아니라 isActive 기준으로 다시 계산되는지.
describe('BOM 중복 검토 + 활성 BOM 선택 (PR-121)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;
  const mat: Record<string, number> = {};
  const bom: Record<string, number> = {};
  let woId: number;

  const get = (url: string, token = userToken) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const patch = (url: string, token: string) => request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, token = userToken) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);

  const login = async (role?: UserRole) => {
    const email = `bom-active-${role ?? 'user'}-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'BOM Active E2E' });
    if (role) await dataSource.getRepository(User).update({ email }, { role });
    return (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken as string;
  };
  const mkItem = async (code: string, type: string, extra: any = {}) =>
    (await post('/items').send({ code, name: code, type, ...extra }).expect(201)).body.data.id as number;
  const mkStyle = async (styleNo: string) => {
    await post('/master-styles').send({ styleNo, factory: '베트남', buyer: 'X', totalQty: 100, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' }).expect(201);
    return dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo } });
  };
  const mkBom = async (style: MasterStyle, lines: [number, number][], isActive: boolean) => {
    const b = await dataSource.getRepository(Bom).save(dataSource.getRepository(Bom).create({ bomNo: 'BOM-1', version: 'V1', isActive, style }));
    for (const [materialId, consumption] of lines) {
      await dataSource.getRepository(BomItem).save(
        dataSource.getRepository(BomItem).create({ bom: b, material: { id: materialId } as Item, category: '겉감', colorCode: 'BK', spec: 'S', consumption, requiredQty: 0, supplier: null, unitPrice: 0, remarks: '' }),
      );
    }
    return b.id;
  };
  const requirements = async (id: number) => (await get(`/work-orders/${id}/material-requirements`).expect(200)).body.data;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    userToken = await login();
    managerToken = await login(UserRole.MANAGER);

    mat.a = await mkItem('BA-FABRIC', 'RAW_MATERIAL');
    mat.b = await mkItem('BA-LINING', 'RAW_MATERIAL');

    // S-DIFF: 실제 MB72BLM102Z처럼 내용이 다른 BOM 2건(오래된 것: 원단 1.0 / 최신: 원단 1.25 + 안감 0.8). 둘 다 활성 후보.
    const diff = await mkStyle('BA-DIFF');
    bom.diffOld = await mkBom(diff, [[mat.a, 1]], true);
    bom.diffNew = await mkBom(diff, [[mat.a, 1.25], [mat.b, 0.8]], true);
    // S-SAME: 내용이 완전히 같은 중복(마이그레이션 시드 이후 상태: 오래된 것 비활성, 최신만 활성)
    const same = await mkStyle('BA-SAME');
    bom.sameOld = await mkBom(same, [[mat.a, 2]], false);
    bom.sameNew = await mkBom(same, [[mat.a, 2]], true);
    // S-NAME: 내용은 같은데 자재 마스터(Item) 레코드만 다른 중복 — 이름이 공백/줄바꿈만 다른 Item 두 개(운영에서 실제로 발견된 패턴)
    const nameA = await mkItem('BA-NAME-A', 'RAW_MATERIAL', { name: '다후다\nLINING' });
    const nameB = await mkItem('BA-NAME-B', 'RAW_MATERIAL', { name: '다후다\r\nLINING' });
    const nameStyle = await mkStyle('BA-NAME');
    bom.nameOld = await mkBom(nameStyle, [[nameA, 0.5]], false);
    bom.nameNew = await mkBom(nameStyle, [[nameB, 0.5]], true);
    // S-ONE: BOM 1건 — 중복이 아니므로 목록에 나오지 않는다
    const one = await mkStyle('BA-ONE');
    await mkBom(one, [[mat.a, 3]], true);

    const fg = await mkItem('BA-FG', 'FINISHED_GOOD', { styleNo: 'BA-DIFF' });
    woId = (await post('/work-orders').send({ itemId: fg, targetQuantity: 100 }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('GET /boms/duplicates: BOM이 2건 이상인 스타일만, 확인이 필요한 것(내용 다름/활성 2건)이 먼저', async () => {
    const list = (await get('/boms/duplicates').expect(200)).body.data as any[];
    const mine = list.filter((s) => s.styleNo.startsWith('BA-'));
    expect(mine.map((s) => s.styleNo)).toEqual(['BA-DIFF', 'BA-NAME', 'BA-SAME']); // BA-ONE 없음, needsReview가 앞, 나머지는 스타일번호순

    const diff = mine[0];
    expect(diff).toMatchObject({ bomCount: 2, activeCount: 2, identical: false, needsReview: true });
    expect(diff.boms.map((b: any) => [b.id, b.isActive, b.itemCount])).toEqual([[bom.diffOld, true, 1], [bom.diffNew, true, 2]]);
    expect(diff.boms[1].items.map((i: any) => [i.materialName, i.consumption])).toEqual([['BA-FABRIC', 1.25], ['BA-LINING', 0.8]]);

    // 이름·소요량은 같고 Item 레코드만 다른 중복: identical=false지만 sameByName=true → 검토 필요 목록에는 올리지 않는다
    const named = mine[1];
    expect(named).toMatchObject({ styleNo: 'BA-NAME', identical: false, sameByName: true, activeCount: 1, needsReview: false });

    const same = mine[2];
    expect(same).toMatchObject({ bomCount: 2, activeCount: 1, identical: true, sameByName: true, needsReview: false });
    expect(diff.sameByName).toBe(false);
  });

  it('기본 상태(활성 후보 2건)에서는 소요명세서가 기존과 같이 최신 id BOM을 쓴다', async () => {
    const r = await requirements(woId);
    expect(r.bom).toMatchObject({ id: bom.diffNew, isActive: true });
    expect(r.rows.map((x: any) => [x.itemName, x.requiredQty])).toEqual([['BA-FABRIC', 125], ['BA-LINING', 80]]);
  });

  it('활성 BOM 선택은 MANAGER/ADMIN만(일반 사용자 403), 인증 없으면 401', async () => {
    await patch('/boms/styles/BA-DIFF/active-bom', userToken).send({ bomId: bom.diffOld }).expect(403);
    await request(app.getHttpServer()).patch('/boms/styles/BA-DIFF/active-bom').send({ bomId: bom.diffOld }).expect(401);
  });

  it('활성 BOM을 오래된 것으로 바꾸면 그 스타일의 나머지는 비활성이 되고, 소요명세서가 그 선택으로 다시 계산된다', async () => {
    const res = await patch('/boms/styles/BA-DIFF/active-bom', managerToken).send({ bomId: bom.diffOld }).expect(200);
    expect(res.body.data).toMatchObject({ styleNo: 'BA-DIFF', activeBomId: bom.diffOld });
    expect(res.body.data.boms).toEqual([{ id: bom.diffOld, isActive: true }, { id: bom.diffNew, isActive: false }]);

    const r = await requirements(woId);
    expect(r.bom).toMatchObject({ id: bom.diffOld, isActive: true });
    expect(r.rows.map((x: any) => [x.itemName, x.consumptionPerUnit, x.requiredQty])).toEqual([['BA-FABRIC', 1, 100]]);
    expect(r.totals.materialCount).toBe(1);

    const list = (await get('/boms/duplicates').expect(200)).body.data as any[];
    const diff = list.find((s) => s.styleNo === 'BA-DIFF');
    expect(diff.activeCount).toBe(1);
    expect(diff.boms.map((b: any) => b.isActive)).toEqual([true, false]);
    expect(diff.needsReview).toBe(true); // 내용이 다른 중복은 선택 후에도 목록 상단에 남아 선택 상태를 확인할 수 있다
  });

  it('다시 최신으로 되돌리면 소요명세서도 원래대로', async () => {
    await patch('/boms/styles/BA-DIFF/active-bom', managerToken).send({ bomId: bom.diffNew }).expect(200);
    const r = await requirements(woId);
    expect(r.bom.id).toBe(bom.diffNew);
    expect(r.rows).toHaveLength(2);
  });

  it('다른 스타일의 BOM id를 주면 400, 없는 스타일은 404, 잘못된 body는 400', async () => {
    await patch('/boms/styles/BA-DIFF/active-bom', managerToken).send({ bomId: bom.sameNew }).expect(400);
    await patch('/boms/styles/NO-SUCH-STYLE/active-bom', managerToken).send({ bomId: 1 }).expect(404);
    await patch('/boms/styles/BA-DIFF/active-bom', managerToken).send({ bomId: 'x' }).expect(400);
    await patch('/boms/styles/BA-DIFF/active-bom', managerToken).send({}).expect(400);
    // 실패한 요청은 상태를 바꾸지 않는다
    expect((await requirements(woId)).bom.id).toBe(bom.diffNew);
  });

  it('활성 BOM이 하나도 없는 비정상 상태여도 소요명세서는 최신 BOM으로 대체해 계산한다(BOM 없음으로 오인 금지)', async () => {
    await dataSource.getRepository(Bom).update({ id: bom.diffOld }, { isActive: false });
    await dataSource.getRepository(Bom).update({ id: bom.diffNew }, { isActive: false });
    const r = await requirements(woId);
    expect(r.reason).toBeNull();
    expect(r.bom.id).toBe(bom.diffNew);
    const list = (await get('/boms/duplicates').expect(200)).body.data as any[];
    expect(list.find((s) => s.styleNo === 'BA-DIFF')).toMatchObject({ activeCount: 0, needsReview: true });
  });

  it('완전 동일한 중복 스타일에서도 선택이 동작한다', async () => {
    await patch('/boms/styles/BA-SAME/active-bom', managerToken).send({ bomId: bom.sameOld }).expect(200);
    const same = ((await get('/boms/duplicates').expect(200)).body.data as any[]).find((s) => s.styleNo === 'BA-SAME');
    expect(same.boms.map((b: any) => [b.id, b.isActive])).toEqual([[bom.sameOld, true], [bom.sameNew, false]]);
  });
});
