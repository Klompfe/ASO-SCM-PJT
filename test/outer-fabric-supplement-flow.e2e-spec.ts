import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-outer-fabric-supplement-flow.sqlite');
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
import { Item } from '../src/items/entities/item.entity';
import { MasterStyle } from '../src/styles/entities/master-style.entity';

// PR-258: 겉감 행 일괄 보충(서버) — 사전 판정(읽기 전용)과 실행을 실제 API+DB 로 확인한다. 합성 값만, 네트워크 호출 0.
describe('겉감 행 보충 API (PR-258)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();
  const http = () => app.getHttpServer();
  const post = (url: string) => request(http()).post(url).set('Authorization', `Bearer ${token}`);
  const get = (url: string) => request(http()).get(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const email = `outer-supp-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Outer Supp E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const SHELL_NAME = `겉감 OUT-SHELL 합성${tag}`;
  const ov = (styleNo: string) => ({ styleNo, factory: '베트남', totalQty: 100, buyer: 'PR258 Buyer', shipDate: '2026-02-03' });
  const baseRows = () => [
    { category: '안감', itemName: `LIN합성${tag}`, colorCode: 'BK', consumption: 1, requiredQty: 100 },
    { category: '실', itemName: `THR합성${tag}`, consumption: 0.5, requiredQty: 50 },
    { category: '라벨', itemName: `LAB합성${tag}`, consumption: 1, requiredQty: 100 },
  ];
  // 엑셀을 다시 파싱한 입력: 기존 3행과 같은 행 + 겉감 1행.
  const shellRow = (extra: Record<string, unknown> = {}) => ({ category: '겉감\r\nOUT-SHELL', itemName: SHELL_NAME, consumption: 1.2, ...extra });
  const input = (styleNo: string, extra: Record<string, unknown> = {}) => ({
    styleNo,
    bomItems: [shellRow(extra), ...baseRows().map(({ requiredQty: _r, ...r }) => r)],
  });
  const seed = async (styleNo: string, rows = baseRows()) => {
    await post('/mapping/commit').send({ styleNo, overviewData: ov(styleNo), bomItems: rows }).expect(201);
  };
  const bomRows = async (styleNo: string) =>
    (await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo } }, relations: ['items', 'items.material'] })).items.sort((a, b) => a.id - b.id);
  const counts = async () => {
    const out: Record<string, number> = {};
    for (const meta of dataSource.entityMetadatas) out[meta.tableName] = await dataSource.getRepository(meta.target as never).count();
    return out;
  };
  const stylePart = async (styleNo: string) => {
    const style = await dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo }, relations: ['overview'] });
    return JSON.stringify(style);
  };

  it('사전 판정: 적격이면 eligible 과 정보를 돌려주고, 아무것도 쓰지 않는다(읽기 전용)', async () => {
    const styleNo = `PR258-CHK-${tag}`;
    await seed(styleNo);
    const before = await counts();
    const res = await post('/mapping/outer-fabric-supplement/check').send(input(styleNo)).expect(200);
    expect(res.body.data).toMatchObject({ eligible: true, applied: false, outerRowIndex: 0, styleNo });
    expect(res.body.data.info).toMatchObject({ liveOuterFabricRows: 0, existingRowCount: 3, sameCount: 3, newRowCount: 1 });
    expect(await counts()).toEqual(before);
  });

  it('실행: 겉감 행이 정확히 1개 추가되고, 스타일·오더개요·선적일·색상×사이즈·계약·기존 BOM 행·다른 테이블은 그대로다', async () => {
    const styleNo = `PR258-RUN-${tag}`;
    await seed(styleNo);
    const otherStyle = `PR258-OTHER-${tag}`;
    await seed(otherStyle);
    const beforeCounts = await counts();
    const beforeStyle = await stylePart(styleNo);
    const beforeOther = await stylePart(otherStyle);
    const beforeRows = JSON.stringify(await bomRows(styleNo));
    const beforeOtherRows = JSON.stringify(await bomRows(otherStyle));

    const res = await post('/mapping/outer-fabric-supplement').send(input(styleNo, { colorCode: 'NV' })).expect(200);
    expect(res.body.data).toMatchObject({ applied: true, eligible: true, createdMaterial: true });
    expect(typeof res.body.data.addedBomItemId).toBe('number');

    const afterRows = await bomRows(styleNo);
    expect(afterRows).toHaveLength(4);
    expect(JSON.stringify(afterRows.filter((r) => r.id !== res.body.data.addedBomItemId))).toBe(beforeRows); // 기존 행 수정·삭제·교체 0
    expect(await stylePart(styleNo)).toBe(beforeStyle); // 스타일·오더개요(선적일 포함) 불변
    expect(await stylePart(otherStyle)).toBe(beforeOther);
    expect(JSON.stringify(await bomRows(otherStyle))).toBe(beforeOtherRows); // 다른 스타일 불변

    const afterCounts = await counts();
    const changed = Object.keys(afterCounts).filter((t) => afterCounts[t] !== beforeCounts[t]);
    expect(changed.sort()).toEqual(['bom_item_details', 'items'].sort()); // BomItem +1 과 새 Item +1 외에는 어떤 테이블도 변하지 않는다(색상×사이즈·계약·가져오기 로그 포함)
    expect(afterCounts['bom_item_details']).toBe(beforeCounts['bom_item_details'] + 1);
    expect(afterCounts['items']).toBe(beforeCounts['items'] + 1);

    const added = afterRows.find((r) => r.id === res.body.data.addedBomItemId)!;
    expect(added.category).toBe('겉감\r\nOUT-SHELL'); // 구분 원문 그대로
    expect(added.material.name).toBe(SHELL_NAME);
    expect(added.colorCode).toBe('NV');
    expect(added.spec).toBe('N/A');
    expect(Number(added.consumption)).toBe(1.2);
    expect(Number(added.requiredQty)).toBe(120); // 요척 × 스타일 총수량(100)
    expect(added.composition ?? null).toBeNull();
  });

  it('필요량·저장 값이 기존 bom-reconcile ADD 루틴과 같다', async () => {
    const viaSupp = `PR258-EQ1-${tag}`;
    const viaRec = `PR258-EQ2-${tag}`;
    await seed(viaSupp);
    await seed(viaRec);
    await post('/mapping/outer-fabric-supplement').send(input(viaSupp, { colorCode: 'NV', spec: '58"' })).expect(200);
    await post('/mapping/bom-reconcile').send({ styleNo: viaRec, actions: [{ type: 'ADD', newItem: shellRow({ colorCode: 'NV', spec: '58"' }) }] }).expect(201);
    const pick = (rows: BomItem[]) => {
      const r = rows.find((x) => x.category.includes('OUT-SHELL'))!;
      return [r.category, r.material.name, r.colorCode, r.spec, Number(r.consumption), Number(r.requiredQty), Number(r.unitPrice), r.remarks, r.supplier, r.composition ?? null, r.hsCode ?? null];
    };
    expect(pick(await bomRows(viaSupp))).toEqual(pick(await bomRows(viaRec)));
  });

  it('겉감 Item 은 정규화 이름이 같으면 재사용하고(두 번째부터 새로 만들지 않음) 이름 대소문자·공백이 달라도 같은 Item 이다', async () => {
    const a = `PR258-ITEM1-${tag}`;
    const b = `PR258-ITEM2-${tag}`;
    await seed(a);
    await seed(b);
    const itemRepo = dataSource.getRepository(Item);
    // 앞선 테스트가 SHELL_NAME Item 을 이미 만들었으므로 이 테스트 전용 이름을 쓴다.
    const own = `겉감 OUT-SHELL 전용${tag}`;
    const withOwn = (styleNo: string, name: string) => ({ styleNo, bomItems: [{ category: '겉감 OUT-SHELL', itemName: name, consumption: 1.2 }, ...baseRows().map(({ requiredQty: _r, ...r }) => r)] });
    const res1 = await post('/mapping/outer-fabric-supplement').send(withOwn(a, own)).expect(200);
    const itemCount = await itemRepo.count();
    const variant = withOwn(b, `  겉감  OUT-shell 전용${tag} `);
    const res2 = await post('/mapping/outer-fabric-supplement').send(variant).expect(200);
    expect(res1.body.data.createdMaterial).toBe(true);
    expect(res2.body.data).toMatchObject({ applied: true, createdMaterial: false });
    expect(await itemRepo.count()).toBe(itemCount);
    const ma = (await bomRows(a)).find((r) => r.category.includes('OUT-SHELL'))!;
    const mb = (await bomRows(b)).find((r) => r.category.includes('OUT-SHELL'))!;
    expect(mb.material.id).toBe(ma.material.id); // 공유
  });

  it('혼용률: 입력에 값이 있으면 앞뒤 공백만 정리해 저장하고, 없으면 null 이다', async () => {
    const a = `PR258-COMP1-${tag}`;
    const b = `PR258-COMP2-${tag}`;
    await seed(a);
    await seed(b);
    await post('/mapping/outer-fabric-supplement').send(input(a, { composition: '  WOOL 60% NYLON 40% ' })).expect(200);
    await post('/mapping/outer-fabric-supplement').send(input(b, { composition: '   ' })).expect(200);
    expect((await bomRows(a)).find((r) => r.category.includes('OUT-SHELL'))!.composition).toBe('WOOL 60% NYLON 40%');
    expect((await bomRows(b)).find((r) => r.category.includes('OUT-SHELL'))!.composition ?? null).toBeNull();
  });

  it('멱등: 같은 요청을 한 번 더 보내면 ALREADY_HAS_OUTER_FABRIC 이고 아무것도 쓰지 않는다', async () => {
    const styleNo = `PR258-IDEM-${tag}`;
    await seed(styleNo);
    await post('/mapping/outer-fabric-supplement').send(input(styleNo)).expect(200);
    const before = await counts();
    const rowsBefore = JSON.stringify(await bomRows(styleNo));
    const again = await post('/mapping/outer-fabric-supplement').send(input(styleNo)).expect(200);
    expect(again.body.data).toMatchObject({ applied: false, eligible: false, reason: 'ALREADY_HAS_OUTER_FABRIC' });
    expect(await counts()).toEqual(before);
    expect(JSON.stringify(await bomRows(styleNo))).toBe(rowsBefore);
  });

  it('판정이 오래된 상태에서도 안전하다: 사전 판정 뒤에 겉감 행이 생기면 실행은 트랜잭션 안에서 다시 판정해 쓰지 않는다', async () => {
    const styleNo = `PR258-STALE-${tag}`;
    await seed(styleNo);
    expect((await post('/mapping/outer-fabric-supplement/check').send(input(styleNo)).expect(200)).body.data.eligible).toBe(true);
    await post('/mapping/bom-reconcile').send({ styleNo, actions: [{ type: 'ADD', newItem: { category: '겉감', itemName: `다른겉감${tag}`, consumption: 1 } }] }).expect(201); // 그 사이 다른 경로로 겉감 추가
    const n = (await bomRows(styleNo)).length;
    const res = await post('/mapping/outer-fabric-supplement').send(input(styleNo)).expect(200);
    expect(res.body.data).toMatchObject({ applied: false, reason: 'ALREADY_HAS_OUTER_FABRIC' });
    expect((await bomRows(styleNo)).length).toBe(n);
  });

  it('동시 호출 두 개가 겹쳐도 겉감 행은 둘 생기지 않는다', async () => {
    const styleNo = `PR258-CONC-${tag}`;
    await seed(styleNo);
    const results = await Promise.all([
      post('/mapping/outer-fabric-supplement').send(input(styleNo)),
      post('/mapping/outer-fabric-supplement').send(input(styleNo)),
    ]);
    const outer = (await bomRows(styleNo)).filter((r) => r.category.includes('OUT-SHELL'));
    expect(outer).toHaveLength(1);
    // 한 요청은 적용되고 다른 요청은 거부(ALREADY) 또는 실패(SQLite 단일 연결의 트랜잭션 충돌) — 어느 쪽이든 중복은 없다.
    expect(results.filter((r) => r.status === 200 && r.body.data.applied === true)).toHaveLength(1);
  });

  it('부적격이면 아무것도 쓰지 않고 사유 코드를 돌려준다(미등록·BOM 없음·엉뚱한 파일·입력 겉감 없음/2개/빈 이름)', async () => {
    const stub = `PR258-STUB-${tag}`;
    await post('/mapping/commit').send({ styleNo: stub, overviewData: ov(stub), bomItems: [] }).expect(201);
    const full = `PR258-NO-${tag}`;
    await seed(full);
    const before = await counts();
    const rowsBefore = JSON.stringify(await bomRows(full));

    const reason = async (body: unknown) => (await post('/mapping/outer-fabric-supplement').send(body as object).expect(200)).body.data.reason;
    expect(await reason(input(`PR258-NEVER-${tag}`))).toBe('NOT_REGISTERED');
    expect(await reason(input(stub))).toBe('NO_BOM');
    expect(await reason({ styleNo: full, bomItems: [shellRow(), { category: '부자재', itemName: `전혀다른${tag}`, consumption: 1 }, ...input(full).bomItems.slice(1)] })).toBe('OTHER_CHANGES');
    expect(await reason({ styleNo: full, bomItems: input(full).bomItems.slice(1) })).toBe('NO_OUTER_FABRIC_ROW');
    expect(await reason({ styleNo: full, bomItems: [...input(full).bomItems, { category: '겉감', itemName: `겉감2${tag}`, consumption: 1 }] })).toBe('MULTIPLE_OUTER_FABRIC_ROWS');
    expect(await reason({ styleNo: full, bomItems: [shellRow({ itemName: '   ' }), ...input(full).bomItems.slice(1)] })).toBe('EMPTY_NAME');
    expect(await counts()).toEqual(before);
    expect(JSON.stringify(await bomRows(full))).toBe(rowsBefore);
  });

  it('보충 후 겉감 점검(PR-256)에서 해당 스타일이 겉감 행 없음(noRow)에서 겉감 혼용률 비어 있음(blank)으로 바뀐다', async () => {
    const styleNo = `PR258-AUD-${tag}`;
    await seed(styleNo);
    const status = async () => (await get(`/boms/outer-fabric-audit?q=${styleNo}`).expect(200)).body.data.items.find((i: any) => i.styleNo === styleNo)?.status;
    expect(await status()).toBe('noRow');
    await post('/mapping/outer-fabric-supplement').send(input(styleNo)).expect(200);
    expect(await status()).toBe('blank');
    // 혼용률을 채우면(수동 입력) 점검 목록에서 사라진다.
    const shell = (await bomRows(styleNo)).find((r) => r.category.includes('OUT-SHELL'))!;
    await request(http()).patch(`/boms/items/${shell.id}`).set('Authorization', `Bearer ${token}`).send({ composition: 'WOOL 100%' }).expect(200);
    expect(await status()).toBeUndefined();
  });

  it('입력 형식 오류는 400, 인증이 없으면 401', async () => {
    await post('/mapping/outer-fabric-supplement').send({ styleNo: 'X' }).expect(400);
    await post('/mapping/outer-fabric-supplement/check').send({ bomItems: [] }).expect(400);
    await post('/mapping/outer-fabric-supplement').send({ styleNo: 'X', bomItems: [{ category: '겉감' }] }).expect(400);
    await request(http()).post('/mapping/outer-fabric-supplement').send(input('X')).expect(401);
    await request(http()).post('/mapping/outer-fabric-supplement/check').send(input('X')).expect(401);
  });
});
