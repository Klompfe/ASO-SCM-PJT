import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-excel-reconcile-flow.sqlite');
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
import { PurchaseOrder } from '../src/purchase-orders/entities/purchase-order.entity';

// PR-198: 작지 AI로 먼저 만들어진 BOM(요척 2.7, 이름 변형) 위에 자재명세 엑셀을 올리는
// 시나리오 — 저장 전 기존 BOM과 비교(bom-diff)하고, 사람이 고른 동작(bom-reconcile)만
// 적용된다는 것을 e2e로 못 박는다. MB73SKM109Z 실사례(다데<실크> 2.7→2.9, 이름만 다른
// 중복, 발주 1건 연결)를 익명 데이터로 재현한다.
describe('자재명세 엑셀 ↔ 기존 BOM 비교·반영 (PR-198)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let supplierId: number;
  const STYLE = 'RCL-STYLE-1';

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));
  const get = (url: string) => auth(request(app.getHttpServer()).get(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `bom-reconcile-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Reconcile' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
    supplierId = (await post('/suppliers').send({ name: 'RCL공급' }).expect(201)).body.data.id;

    // 작지 AI 분석 경로로 먼저 BOM이 만들어진 상태를 재현(commit) — 요척 2.7(오인식),
    // 이름만 다른 중복 자재(원단A류), 발주 1건이 연결된 자재(다데<실크>) 포함.
    await post('/mapping/commit').send({
      styleNo: STYLE,
      overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 980, buyer: '바이어A' },
      bomItems: [
        { category: '부자재', itemName: '다데<실크>', colorCode: 'N/A', spec: 'N/A', consumption: 2.7, requiredQty: 2646 },
        { category: '겉감', itemName: 'DARK GREY DG (원단A)', colorCode: 'DG', spec: 'S', consumption: 1.73, requiredQty: 1695.4 },
      ],
    }).expect(201);

    const bom = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items', 'items.material'] });
    const dadeItem = bom.items.find((i) => i.material.name === '다데<실크>')!;
    // 다데<실크>에 연결된(취소 아닌) 발주 1건 — REMOVE 시 경고 확인용.
    await post('/purchase-orders').send({ supplierId, itemId: dadeItem.material.id, quantity: 10, unitPrice: 2, styleNo: STYLE }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('A-1. POST /mapping/bom-diff (읽기 전용)', () => {
    it('BOM이 없는 스타일은 hasExistingBom=false만 돌려준다', async () => {
      const res = await post('/mapping/bom-diff').send({ styleNo: 'RCL-NO-BOM', bomItems: [] }).expect(201);
      expect(res.body.data).toEqual({ hasExistingBom: false });
    });

    it('요척 2.7→2.9는 VALUE_DIFF, 이름만 다른 자재는 SIMILAR 짝으로 제안된다 — 아무것도 저장하지 않는다', async () => {
      const res = await post('/mapping/bom-diff').send({
        styleNo: STYLE,
        bomItems: [
          { category: '부자재', itemName: '다데<실크>', consumption: 2.9 },
          { category: '겉감', itemName: '원단A', consumption: 1.72 },
        ],
      }).expect(201);

      const { hasExistingBom, rows, similarPairs } = res.body.data;
      expect(hasExistingBom).toBe(true);
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'VALUE_DIFF',
          existing: expect.objectContaining({ itemName: '다데<실크>', consumption: 2.7, linkedPoCount: 1 }),
          incoming: expect.objectContaining({ itemName: '다데<실크>', consumption: 2.9 }),
        }),
      ]);
      expect(similarPairs).toEqual([
        expect.objectContaining({
          existing: expect.objectContaining({ itemName: 'DARK GREY DG (원단A)' }),
          incoming: expect.objectContaining({ itemName: '원단A' }),
        }),
      ]);

      // 비교는 저장하지 않는다 — 기존 BOM 행 수가 그대로다.
      const bom = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items'] });
      expect(bom.items).toHaveLength(2);
    });
  });

  describe('A-2. POST /mapping/bom-reconcile — "엑셀 기준으로 모두 맞추기" 적용', () => {
    it('VALUE_DIFF→OVERWRITE, SIMILAR→REPLACE 적용 후 부족분 표에 중복 없이 요척 2.9가 반영된다', async () => {
      const bomBefore = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items', 'items.material'] });
      const dadeId = bomBefore.items.find((i) => i.material.name === '다데<실크>')!.id;
      const fabricId = bomBefore.items.find((i) => i.material.name === 'DARK GREY DG (원단A)')!.id;

      const res = await post('/mapping/bom-reconcile').send({
        styleNo: STYLE,
        actions: [
          { type: 'OVERWRITE', bomItemId: dadeId, newItem: { itemName: '다데<실크>', category: '부자재', consumption: 2.9 } },
          { type: 'REPLACE', bomItemId: fabricId, newItem: { itemName: '원단A', category: '겉감', consumption: 1.72, colorCode: 'DG', spec: 'S' } },
        ],
      }).expect(201);

      expect(res.body.data.applied).toEqual({ overwritten: 1, added: 0, removed: 0, replaced: 1 });
      expect(res.body.data.remainingBomItemCount).toBe(2);

      const requirements = await get(`/work-orders/style-requirements?styleNo=${STYLE}`).expect(200);
      const rows = requirements.body.data.rows;
      // 중복 없음: 자재 2건 각각 하나의 행으로만 나온다(이름만 다른 중복 자재가 합쳐졌으므로).
      expect(rows).toHaveLength(2);
      const dadeRow = rows.find((r: any) => r.itemName === '다데<실크>');
      expect(dadeRow.consumptionPerUnit).toBe(2.9);
      expect(dadeRow.requiredQty).toBe(2842); // 2.9 × 980
      const fabricRow = rows.find((r: any) => r.itemName === '원단A');
      expect(fabricRow).toBeDefined();
      expect(fabricRow.consumptionPerUnit).toBe(1.72);
    });

    it('bom-diff를 다시 호출하면 이제 SAME으로 나온다(반영이 실제로 저장됐다는 증거)', async () => {
      const res = await post('/mapping/bom-diff').send({
        styleNo: STYLE,
        bomItems: [
          { category: '부자재', itemName: '다데<실크>', consumption: 2.9 },
          { category: '겉감', itemName: '원단A', consumption: 1.72, colorCode: 'DG', spec: 'S' },
        ],
      }).expect(201);
      expect(res.body.data.rows).toEqual([
        expect.objectContaining({ type: 'SAME', existing: expect.objectContaining({ itemName: '다데<실크>' }) }),
        expect.objectContaining({ type: 'SAME', existing: expect.objectContaining({ itemName: '원단A' }) }),
      ]);
    });

    it('다른 스타일의 bomItemId가 섞이면 400이고 아무것도 바뀌지 않는다(전체 롤백)', async () => {
      const before = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items'] });
      await post('/mapping/bom-reconcile').send({
        styleNo: STYLE,
        actions: [
          { type: 'ADD', newItem: { itemName: 'RCL-새자재', category: '부자재', consumption: 1 } },
          { type: 'REMOVE', bomItemId: 999999 },
        ],
      }).expect(400);
      const after = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items'] });
      expect(after.items).toHaveLength(before.items.length); // ADD도 같이 롤백됨
    });

    it('등록된 BOM이 없는 스타일은 404', async () => {
      await post('/mapping/bom-reconcile').send({ styleNo: 'RCL-NO-BOM', actions: [] }).expect(404);
    });

    it('REMOVE해도 자재 마스터(Item)와 기존 발주는 그대로 남는다', async () => {
      const bom = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items', 'items.material'] });
      const dadeItem = bom.items.find((i) => i.material.name === '다데<실크>')!;

      const res = await post('/mapping/bom-reconcile').send({
        styleNo: STYLE,
        actions: [{ type: 'REMOVE', bomItemId: dadeItem.id }],
      }).expect(201);
      expect(res.body.data.warnings.some((w: string) => w.includes('연결된 발주(취소 제외) 1건'))).toBe(true);

      const remainingBom = await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items'] });
      expect(remainingBom.items.map((i) => i.id)).not.toContain(dadeItem.id);

      const po = await dataSource.getRepository(PurchaseOrder).findOne({ where: { itemId: dadeItem.material.id, styleNo: STYLE } });
      expect(po).not.toBeNull(); // 발주는 그대로
    });
  });

  describe('B. GET /master-styles/similar (작지 스타일번호 끝 글자 유사 경고)', () => {
    beforeAll(async () => {
      await post('/master-styles').send({ styleNo: 'MB73SKM109Z', factory: '베트남', buyer: '바이어A', totalQty: 980, brand: 'x', itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01' }).expect(201);
    });

    it('끝 글자만 다른 기존 스타일을 찾아준다(자동 변경 아님, 조회만)', async () => {
      const res = await get('/master-styles/similar?styleNo=MB73SKM109').expect(200);
      expect(res.body.data).toEqual([{ styleNo: 'MB73SKM109Z' }]);
    });

    it('이미 존재하는(완전히 같은) 스타일번호는 비슷한 스타일로 나오지 않는다', async () => {
      const res = await get('/master-styles/similar?styleNo=MB73SKM109Z').expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('비슷한 스타일이 없으면 빈 배열', async () => {
      const res = await get('/master-styles/similar?styleNo=NO-SUCH-PREFIX').expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('styleNo가 없으면 400', async () => {
      await get('/master-styles/similar').expect(400);
    });
  });
});
