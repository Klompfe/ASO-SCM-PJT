import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-analysis-outer-fabric-match-flow.sqlite');
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

// PR-257: 엑셀로 보충한 겉감 행(구분 `겉감 OUT-SHELL`)과 작지 인식 겉감 행(구분 `겉감`)을 비교 화면에서 "겉감 짝"으로 제안하고,
// 합치기를 서버가 라이브 데이터로 다시 검증하는지 실제 API+DB 로 확인한다. 합성 값만, 네트워크 호출 0.
describe('작지 저장: 겉감 짝 합치기 (PR-257)', () => {
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
    const email = `outer-pair-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Outer Pair E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const overview = (styleNo: string) => ({ styleNo, styleName: null, itemType: null, brand: null, productionType: 'CMT', factory: '베트남', buyer: null, totalQty: 100, targetRdd: null, documentDate: null });
  const ai = (styleNo: string, bomItems: any[], decisions?: any) => ({ overview: overview(styleNo), bomItems, sizeSpecs: [], workNotes: null, ...(decisions ? { decisions } : {}) });
  const row = (category: string, itemName: string, extra: Record<string, unknown> = {}) => ({ category, itemName, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null, ...extra });
  const items = async (styleNo: string) =>
    (await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo } }, relations: ['items', 'items.material'] })).items.sort((a, b) => a.id - b.id);
  const ov = (styleNo: string) => ({ styleNo, factory: '베트남', totalQty: 100, buyer: 'PR257 Buyer', shipDate: '' });

  // 엑셀로 보충된 상태: 겉감 행(일반 라벨 이름, 색상·규격 N/A, 혼용률 비어 있음) + 안감 행.
  const seedExcelStyle = async (styleNo: string, extra: any[] = []) => {
    await post('/mapping/commit').send({
      styleNo,
      overviewData: ov(styleNo),
      bomItems: [
        { category: '겉감 OUT-SHELL', itemName: `겉감 OUT-SHELL ${tag}`, consumption: 1.2, requiredQty: 120 },
        { category: '안감', itemName: `LIN합성${tag}`, colorCode: 'BK', consumption: 1, requiredQty: 100 },
        ...extra,
      ],
    }).expect(201);
  };

  it('비교: 기존 겉감 1·새 겉감 1이면(구분·이름·색상·규격이 달라도) outerFabricPair 로 제안되고 안감은 same 이다', async () => {
    const styleNo = `PR257-CMP-${tag}`;
    await seedExcelStyle(styleNo);
    const res = await post('/sales-orders/bom-compare')
      .send(ai(styleNo, [row('겉감', `합성소재${tag}`, { colorCode: 'NV', spec: '58"', composition: 'WOOL 100%' }), row('안감', `LIN합성${tag}`, { colorCode: 'BK' })]))
      .expect(201);
    const rows = res.body.data.rows;
    const pair = rows.filter((r: any) => r.outerFabricPair);
    expect(pair).toHaveLength(1);
    expect(pair[0]).toMatchObject({ type: 'similar', compositionStatus: 'fillEmpty' });
    expect(pair[0].existing.itemName).toContain('OUT-SHELL');
    expect(rows.filter((r: any) => r.type === 'same')).toHaveLength(1);
    expect(rows.filter((r: any) => r.type === 'new')).toHaveLength(0);
  });

  it('합치기: 겉감 행 수가 늘지 않고 혼용률만 채워지며 기존 자재명·구분·요척은 유지된다(멱등: 두 번 보내도 불변)', async () => {
    const styleNo = `PR257-MERGE-${tag}`;
    await seedExcelStyle(styleNo);
    const before = await items(styleNo);
    const shell = before.find((i) => i.category.includes('OUT-SHELL'))!;
    const payload = ai(
      styleNo,
      [row('겉감', `합성소재${tag}`, { colorCode: 'NV', composition: 'WOOL 60% NYLON 40%' }), row('안감', `LIN합성${tag}`, { colorCode: 'BK' })],
      { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id }] },
    );
    await post('/sales-orders/commit-analysis').send(payload).expect(201);
    const after = await items(styleNo);
    expect(after).toHaveLength(before.length); // 중복 생성 0
    const merged = after.find((i) => i.id === shell.id)!;
    expect(merged.composition).toBe('WOOL 60% NYLON 40%');
    expect(merged.material.name).toBe(shell.material.name); // 이름 유지
    expect(merged.category).toBe(shell.category); // 구분 유지
    expect(Number(merged.consumption)).toBe(1.2);
    expect(await dataSource.getRepository('Item').count({ where: { name: `합성소재${tag}` } })).toBe(0); // 새 Item 없음

    await post('/sales-orders/commit-analysis').send(payload).expect(201); // 같은 요청 한 번 더
    const again = await items(styleNo);
    expect(again).toHaveLength(before.length);
    expect(again.find((i) => i.id === shell.id)!.composition).toBe('WOOL 60% NYLON 40%');
  });

  it('PR-246 규칙: 기존 혼용률이 있고 다르면 유지하고, overwriteComposition 을 명시한 때만 교체한다', async () => {
    const styleNo = `PR257-COMP-${tag}`;
    await seedExcelStyle(styleNo);
    const shell = (await items(styleNo)).find((i) => i.category.includes('OUT-SHELL'))!;
    await request(http()).patch(`/boms/items/${shell.id}`).set('Authorization', `Bearer ${token}`).send({ composition: 'COTTON 100%' }).expect(200);
    const base = [row('겉감', `합성소재${tag}`, { composition: 'WOOL 100%' }), row('안감', `LIN합성${tag}`, { colorCode: 'BK' })];

    await post('/sales-orders/commit-analysis').send(ai(styleNo, base, { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id }] })).expect(201);
    expect((await items(styleNo)).find((i) => i.id === shell.id)!.composition).toBe('COTTON 100%');

    await post('/sales-orders/commit-analysis').send(ai(styleNo, base, { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id, overwriteComposition: true }] })).expect(201);
    expect((await items(styleNo)).find((i) => i.id === shell.id)!.composition).toBe('WOOL 100%');
  });

  it('겉감 짝 조건 불충족: 기존 겉감이 2개면 짝 제안이 없고, 합치기 요청은 서버가 거부하며 아무것도 바뀌지 않는다', async () => {
    const styleNo = `PR257-TWO-${tag}`;
    await seedExcelStyle(styleNo, [{ category: '겉감', itemName: `겉감두번째${tag}`, consumption: 1, requiredQty: 100 }]);
    const before = await items(styleNo);
    const shell = before.find((i) => i.category.includes('OUT-SHELL'))!;
    const bomItems = [row('겉감', `합성소재${tag}`, { composition: 'WOOL 100%' })];

    const cmp = await post('/sales-orders/bom-compare').send(ai(styleNo, bomItems)).expect(201);
    expect(cmp.body.data.rows.some((r: any) => r.outerFabricPair)).toBe(false);

    await post('/sales-orders/commit-analysis').send(ai(styleNo, bomItems, { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id }] })).expect(400);
    const after = await items(styleNo);
    expect(after.map((i) => [i.id, i.composition])).toEqual(before.map((i) => [i.id, i.composition])); // 전체 롤백
  });

  it('겉감 짝 조건 불충족: 새 인식 겉감이 2개면 짝 제안이 없고 합치기는 거부된다', async () => {
    const styleNo = `PR257-INC2-${tag}`;
    await seedExcelStyle(styleNo);
    const shell = (await items(styleNo)).find((i) => i.category.includes('OUT-SHELL'))!;
    const bomItems = [row('겉감', `합성소재A${tag}`), row('겉감', `합성소재B${tag}`, { colorCode: 'NV' })];
    const cmp = await post('/sales-orders/bom-compare').send(ai(styleNo, bomItems)).expect(201);
    expect(cmp.body.data.rows.some((r: any) => r.outerFabricPair)).toBe(false);
    await post('/mapping/commit')
      .send({
        styleNo,
        overviewData: ov(styleNo),
        bomItems: [
          { category: '겉감', itemName: `합성소재A${tag}`, consumption: 1, requiredQty: 100 },
          { category: '겉감', itemName: `합성소재B${tag}`, colorCode: 'NV', consumption: 1, requiredQty: 100 },
        ],
        decisions: { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id }] },
      })
      .expect(400);
  });

  it('서버 방어선: 겉감이 아닌 행을 겉감 행에 합치거나, 겉감 행을 안감 행에 합치는 요청은 화면을 거치지 않아도 거부된다', async () => {
    const styleNo = `PR257-GUARD-${tag}`;
    await seedExcelStyle(styleNo);
    const cur = await items(styleNo);
    const shell = cur.find((i) => i.category.includes('OUT-SHELL'))!;
    const lining = cur.find((i) => i.category === '안감')!;
    // 부자재 새 행 → 기존 겉감 행
    await post('/mapping/commit').send({ styleNo, overviewData: ov(styleNo), bomItems: [{ category: '단추', itemName: `단추${tag}`, consumption: 1, requiredQty: 10 }], decisions: { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: shell.id }] } }).expect(400);
    // 겉감 새 행 → 기존 안감 행
    await post('/mapping/commit').send({ styleNo, overviewData: ov(styleNo), bomItems: [{ category: '겉감', itemName: `겉감${tag}`, consumption: 1, requiredQty: 10 }], decisions: { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: lining.id }] } }).expect(400);
    expect(await items(styleNo)).toHaveLength(cur.length);
  });

  it('겉감과 무관한 기존 합치기 규칙은 그대로 동작한다(부자재 → 부자재)', async () => {
    const styleNo = `PR257-OLD-${tag}`;
    await seedExcelStyle(styleNo, [{ category: '부자재', itemName: `단추A${tag}`, consumption: 1, requiredQty: 10 }]);
    const btn = (await items(styleNo)).find((i) => i.category === '부자재')!;
    await post('/mapping/commit').send({ styleNo, overviewData: ov(styleNo), bomItems: [{ category: '부자재', itemName: `전혀다른${tag}`, consumption: 3, requiredQty: 30 }], decisions: { incoming: [{ index: 0, action: 'mergeInto', mergeIntoBomItemId: btn.id }] } }).expect(201);
    expect((await items(styleNo)).find((i) => i.id === btn.id)!.material.name).toBe(`단추A${tag}`);
  });

  it('commit() 자동 매칭은 그대로다: decisions 없이 저장하면 겉감이 새 행으로 추가된다(사람이 확인하는 비교 경로에서만 합쳐짐)', async () => {
    const styleNo = `PR257-AUTO-${tag}`;
    await seedExcelStyle(styleNo);
    const before = await items(styleNo);
    await post('/sales-orders/commit-analysis').send(ai(styleNo, [row('겉감', `합성소재${tag}`, { composition: 'WOOL 100%' })])).expect(201);
    expect((await items(styleNo)).length).toBe(before.length + 1);
  });

  it('비교 호출은 읽기 전용이다 — 호출 전후 행 수가 같다', async () => {
    const styleNo = `PR257-RO-${tag}`;
    await seedExcelStyle(styleNo);
    const n = (await items(styleNo)).length;
    await post('/sales-orders/bom-compare').send(ai(styleNo, [row('겉감', `합성소재${tag}`)])).expect(201);
    expect((await items(styleNo)).length).toBe(n);
    await get('/boms').query({ styleNo }).expect(200);
  });
});
