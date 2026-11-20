import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bulk-save-server-guard-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Contract, ContractStatus } from '../src/styles/entities/contract.entity';

// PR-249: 비교 없이 들어온 commit-analysis(일괄 저장)도 서버가 오더개요를 조용히 덮어쓰지 않고,
// 승인 대기 계약을 매번 새로 만들지 않는다. 합성 값만 사용.
describe('일괄 저장 서버 방어선 (PR-249)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const stamp = Date.now();
  const styleNo = `GUARD-${stamp}`;
  const fabric = `FABRIC_A_${stamp}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `guard-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Guard E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const overview = (extra: Record<string, unknown> = {}) => ({
    styleNo, styleName: 'Style A', itemType: 'JACKET', brand: 'Brand A', productionType: 'CMT',
    factory: '베트남', buyer: 'Buyer A', totalQty: 100, targetRdd: '2027-03-01', ...extra,
  });
  const body = (ov: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    overview: ov,
    bomItems: [{ category: '겉감', itemName: fabric, spec: 'S', colorCode: 'BK', consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
    sizeSpecs: [],
    workNotes: null,
    ...extra,
  });
  const save = (b: unknown) => auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send(b as object);
  const compare = (b: unknown) => auth(request(app.getHttpServer()).post('/sales-orders/bom-compare')).send(b as object);
  const overviewRow = async () =>
    (await dataSource.query(`SELECT o.* FROM style_overview o JOIN master_style s ON s.overviewId = o.id WHERE s.styleNo = ?`, [styleNo]))[0];
  const contracts = () => dataSource.getRepository(Contract).find({ where: { styleNo }, order: { id: 'ASC' } });

  it('신규 스타일: 전부 저장되고 대기 계약이 1건 생긴다', async () => {
    await save(body(overview())).expect(201);
    const row = await overviewRow();
    expect(row).toMatchObject({ buyer: 'Buyer A', brand: 'Brand A', itemType: 'JACKET', styleName: 'Style A' });
    expect(Number(row.totalQty)).toBe(100);
    expect((await contracts()).map((c) => c.status)).toEqual([ContractStatus.PENDING_APPROVAL]);
  });

  it('기존 스타일 재저장: 다른 값은 유지되고 충돌 알림이 응답에 실리며, 대기 계약은 새로 생기지 않는다(갱신)', async () => {
    const res = await save(body(overview({ buyer: 'Buyer B', totalQty: 250, brand: 'Brand B', targetRdd: '2027-04-01' }))).expect(201);
    const row = await overviewRow();
    expect(row.buyer).toBe('Buyer A');
    expect(row.brand).toBe('Brand A');
    expect(Number(row.totalQty)).toBe(100);
    const conflicts = res.body.data.orderOverviewConflicts as { field: string; existing: unknown; incoming: unknown }[];
    expect(conflicts.map((c) => c.field).sort()).toEqual(['brand', 'buyer', 'targetRdd', 'totalQty']);
    expect(conflicts.find((c) => c.field === 'buyer')).toMatchObject({ existing: 'Buyer A', incoming: 'Buyer B' });
    expect((await contracts()).length).toBe(1);
  });

  it('같은 값·들어온 값이 비어 있음 → 변화 없음/보존(충돌 없음)', async () => {
    const res = await save(body(overview({ buyer: '', styleName: null, brand: undefined, totalQty: null }))).expect(201);
    const row = await overviewRow();
    expect(row).toMatchObject({ buyer: 'Buyer A', styleName: 'Style A', brand: 'Brand A' });
    expect(Number(row.totalQty)).toBe(100);
    expect(res.body.data.orderOverviewConflicts ?? []).toEqual([]);
  });

  it('overwriteOrderFields 로 지정한 항목만 교체된다(지정하지 않은 다른 항목은 유지)', async () => {
    await save(body(overview({ buyer: 'Buyer B', totalQty: 250 }), { overwriteOrderFields: ['buyer'] })).expect(201);
    const row = await overviewRow();
    expect(row.buyer).toBe('Buyer B');
    expect(Number(row.totalQty)).toBe(100);
  });

  it('허용 목록 밖 필드명은 400', async () => {
    await save(body(overview(), { overwriteOrderFields: ['factory'] })).expect(400);
    await save(body(overview(), { overwriteOrderFields: ['status'] })).expect(400);
  });

  it('비어 있던 항목은 선택 없이도 채워진다', async () => {
    await dataSource.query(`UPDATE style_overview SET itemType = NULL WHERE id = (SELECT overviewId FROM master_style WHERE styleNo = ?)`, [styleNo]);
    await save(body(overview({ itemType: 'PANTS' }))).expect(201);
    expect((await overviewRow()).itemType).toBe('PANTS');
  });

  it('공장은 기존처럼 보류(알림), 자재 행 처리는 그대로(같은 키 행 중복 없음)', async () => {
    const res = await save(body(overview({ factory: '삼정' }))).expect(201);
    expect((await overviewRow()).factory).toBe('베트남');
    expect(res.body.data.warnings.some((w: string) => w.includes('factory'))).toBe(true);
    const items = (await auth(request(app.getHttpServer()).get('/boms').query({ styleNo })).expect(200)).body.data.items as any[];
    expect(items.filter((i) => i.material?.name === fabric)).toHaveLength(1);
  });

  it('승인된 계약은 수정하지 않는다(대기 계약이 없으면 현재 동작대로 새 대기 계약을 만든다)', async () => {
    const [pending] = await contracts();
    await dataSource.getRepository(Contract).update(pending.id, { status: ContractStatus.APPROVED });
    const approvedBefore = await dataSource.getRepository(Contract).findOneByOrFail({ id: pending.id });
    await save(body(overview({ totalQty: 100 }))).expect(201);
    const after = await contracts();
    expect(after).toHaveLength(2);
    const approvedAfter = after.find((c) => c.id === pending.id)!;
    expect(approvedAfter.status).toBe(ContractStatus.APPROVED);
    expect(Number(approvedAfter.totalQty)).toBe(Number(approvedBefore.totalQty));
    expect(after.filter((c) => c.status === ContractStatus.PENDING_APPROVAL)).toHaveLength(1);
    // 다시 저장해도 대기 계약은 늘지 않는다.
    await save(body(overview())).expect(201);
    expect((await contracts()).filter((c) => c.status === ContractStatus.PENDING_APPROVAL)).toHaveLength(1);
  });

  it('compare 응답에 오더개요 항목별 상태 4종이 실린다(읽기 전용)', async () => {
    await dataSource.query(`UPDATE style_overview SET brand = NULL WHERE id = (SELECT overviewId FROM master_style WHERE styleNo = ?)`, [styleNo]);
    const row = await overviewRow();
    const res = await compare(body(overview({ buyer: row.buyer, brand: 'Brand Z', styleName: 'Style Other', itemType: null }))).expect(201);
    const byField = Object.fromEntries((res.body.data.overview as any[]).map((r) => [r.field, r]));
    expect(byField.buyer.status).toBe('same');
    expect(byField.brand.status).toBe('fillEmpty');
    expect(byField.styleName).toMatchObject({ status: 'differs', existing: 'Style A', incoming: 'Style Other' });
    expect(byField.itemType.status).toBe('incomingEmpty');
    expect((await overviewRow()).brand).toBeNull(); // 비교는 저장하지 않는다
  });
});
