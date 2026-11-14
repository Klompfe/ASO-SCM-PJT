import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bom-name-and-fields-edit-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-241: ① "이 행만" 자재명 변경(A) ② 자재마스터 이름 변경 + 사용 현황 조회(B)
// ③ BOM 행 공급업체·단가 수정(C). 합성 스타일번호·자재명·공급사명만 사용한다.
describe('BOM 행 자재명/공급업체/단가 수정 (PR-241)', () => {
  let app: INestApplication;
  let token: string;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));
  const get = (url: string) => auth(request(http()).get(url));
  const patch = (url: string) => auth(request(http()).patch(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `bom-name-edit-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'BOM Name Edit E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const commitStyle = (styleNo: string, itemName: string, extra: Record<string, unknown> = {}) =>
    post('/mapping/commit').send({
      styleNo,
      overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR241 Buyer', shipDate: '' },
      bomItems: [{ category: '부자재', itemName, spec: '53"', consumption: 1, requiredQty: 100, colorCode: 'BK', ...extra }],
    }).expect(201);

  describe('A. 이 행만 자재명 변경', () => {
    it('일치하는 기존 자재가 없으면 새 자재를 만들어 연결한다(단위 등 속성 복사)', async () => {
      const styleNo = `PR241A1-${tag}`;
      await commitStyle(styleNo, `합성자재-구이름-${tag}`);
      const bomRes = await get('/boms').query({ styleNo }).expect(200);
      const bomItemId = bomRes.body.data.items[0].id;
      const oldMaterialId = bomRes.body.data.items[0].material.id;

      const res = await patch(`/boms/items/${bomItemId}/material-name`).send({ name: `합성자재-완전새이름-${tag}` }).expect(200);
      expect(res.body.data.resultKind).toBe('createdNew');
      expect(res.body.data.materialId).not.toBe(oldMaterialId);

      const newItem = await get(`/items/${res.body.data.materialId}`).expect(200);
      expect(newItem.body.data.unit).toBe('EA'); // mapping-commit이 신규 생성 시 쓰는 기본 단위를 그대로 복사
    });

    it('정규화 이름이 같은 기존 자재가 있으면 그 자재에 연결되고(새 자재 생성 없음) 이 행의 다른 값은 유지된다', async () => {
      const styleA = `PR241A2A-${tag}`;
      const styleB = `PR241A2B-${tag}`;
      await commitStyle(styleA, `합성자재-대상-${tag}`);
      await commitStyle(styleB, `합성자재-바꿀이름-${tag}`);

      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);
      const targetMaterialId = bomA.body.data.items[0].material.id;

      const bomB = await get('/boms').query({ styleNo: styleB }).expect(200);
      const bomItemIdB = bomB.body.data.items[0].id;

      // 수동 필요수량을 먼저 지정해 둔다 — 이름 변경이 "교체"가 아니므로 유지돼야 한다.
      await patch(`/boms/items/${bomItemIdB}`).send({ manualRequiredQty: 55, manualRequiredQtyNote: '합성 사유' }).expect(200);

      const res = await patch(`/boms/items/${bomItemIdB}/material-name`).send({ name: `합성자재-대상-${tag}` }).expect(200);
      expect(res.body.data.resultKind).toBe('linkedExisting');
      expect(res.body.data.materialId).toBe(targetMaterialId);
      expect(Number(res.body.data.bomItem.manualRequiredQty)).toBe(55);
      expect(res.body.data.bomItem.manualRequiredQtyNote).toBe('합성 사유');

      // 다른 스타일(A)은 영향 없음.
      const bomAAfter = await get('/boms').query({ styleNo: styleA }).expect(200);
      expect(bomAAfter.body.data.items[0].material.name).toBe(`합성자재-대상-${tag}`);
    });

    it('단위가 다른 기존 자재와 이름이 겹치면 거부하고 자재 교체를 안내한다', async () => {
      const styleA = `PR241A3A-${tag}`;
      const styleB = `PR241A3B-${tag}`;
      await commitStyle(styleA, `합성자재-M단위-${tag}`);
      await commitStyle(styleB, `합성자재-EA단위-${tag}`);

      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);
      await patch(`/items/${bomA.body.data.items[0].material.id}`).send({ unit: 'M' }).expect(200);

      const bomB = await get('/boms').query({ styleNo: styleB }).expect(200);
      // EA단위 자재는 기본 단위가 이미 EA(mapping-commit 기본값)이므로 그대로 둔다.

      const res = await patch(`/boms/items/${bomB.body.data.items[0].id}/material-name`).send({ name: `합성자재-M단위-${tag}` }).expect(400);
      expect(res.body.message.message as string).toContain('자재 교체');
    });

    it('이 자재로 이 스타일에 연결된 발주가 있으면 "이 행만 변경"을 거부한다', async () => {
      const styleNo = `PR241A4-${tag}`;
      await commitStyle(styleNo, `합성자재-발주연결-${tag}`);
      const bom = await get('/boms').query({ styleNo }).expect(200);
      const bomItemId = bom.body.data.items[0].id;
      const materialId = bom.body.data.items[0].material.id;
      const supplierId = (await post('/suppliers').send({ name: `PR241공급-${tag}` }).expect(201)).body.data.id;
      await post('/purchase-orders').send({ supplierId, itemId: materialId, quantity: 1, unitPrice: 1, styleNo }).expect(201);

      const res = await patch(`/boms/items/${bomItemId}/material-name`).send({ name: `합성자재-바꿀수없음-${tag}` }).expect(400);
      expect(res.body.message.message as string).toContain('자재마스터 이름 변경');
    });

    it('빈 이름은 거부한다', async () => {
      const styleNo = `PR241A5-${tag}`;
      await commitStyle(styleNo, `합성자재-빈이름테스트-${tag}`);
      const bom = await get('/boms').query({ styleNo }).expect(200);
      await patch(`/boms/items/${bom.body.data.items[0].id}/material-name`).send({ name: '   ' }).expect(400);
    });
  });

  describe('B. 자재마스터 이름 변경(모든 스타일 적용) + 사용 현황', () => {
    it('GET /items/:id/usage가 스타일 수·BOM 행 수·발주 연결 건수를 집계한다', async () => {
      const styleA = `PR241B1A-${tag}`;
      const styleB = `PR241B1B-${tag}`;
      await commitStyle(styleA, `합성자재-사용현황-${tag}`);
      await commitStyle(styleB, `합성자재-사용현황-${tag}`); // 같은 이름 → 같은 자재로 합쳐짐(commit() 기존 규칙)

      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);
      const materialId = bomA.body.data.items[0].material.id;
      const supplierId = (await post('/suppliers').send({ name: `PR241B공급-${tag}` }).expect(201)).body.data.id;
      await post('/purchase-orders').send({ supplierId, itemId: materialId, quantity: 1, unitPrice: 1, styleNo: styleA }).expect(201);

      const usage = await get(`/items/${materialId}/usage`).expect(200);
      expect(usage.body.data).toEqual({ styleCount: 2, bomItemCount: 2, orderCount: 1 });
    });

    it('같은 정규화 이름의 다른 자재가 있으면 품목 수정(이름)이 거부된다', async () => {
      const styleA = `PR241B2A-${tag}`;
      const styleB = `PR241B2B-${tag}`;
      await commitStyle(styleA, `합성자재-B2이름A-${tag}`);
      await commitStyle(styleB, `합성자재-B2이름B-${tag}`);
      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);

      const res = await patch(`/items/${bomA.body.data.items[0].material.id}`).send({ name: `합성자재-B2이름B-${tag}` }).expect(409);
      expect(res.body.message.message as string).toContain('이미 사용 중');
    });

    it('중복이 없으면 품목 이름 변경이 모든 스타일에 반영된다(id 참조 — 복사본이 아님)', async () => {
      const styleA = `PR241B3A-${tag}`;
      const styleB = `PR241B3B-${tag}`;
      await commitStyle(styleA, `합성자재-B3구이름-${tag}`);
      await commitStyle(styleB, `합성자재-B3구이름-${tag}`);
      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);
      const materialId = bomA.body.data.items[0].material.id;

      await patch(`/items/${materialId}`).send({ name: `합성자재-B3새이름-${tag}` }).expect(200);

      const bomAAfter = await get('/boms').query({ styleNo: styleA }).expect(200);
      const bomBAfter = await get('/boms').query({ styleNo: styleB }).expect(200);
      expect(bomAAfter.body.data.items[0].material.name).toBe(`합성자재-B3새이름-${tag}`);
      expect(bomBAfter.body.data.items[0].material.name).toBe(`합성자재-B3새이름-${tag}`); // 다른 스타일도 바로 반영(id 참조)
    });
  });

  describe('C. BOM 행 공급업체·단가 수정', () => {
    it('이 행의 공급업체·단가를 저장하면 그대로 조회된다(마스터·다른 스타일 영향 없음)', async () => {
      const styleA = `PR241C1A-${tag}`;
      const styleB = `PR241C1B-${tag}`;
      await commitStyle(styleA, `합성자재-C1-${tag}`);
      await commitStyle(styleB, `합성자재-C1-${tag}`);
      const bomA = await get('/boms').query({ styleNo: styleA }).expect(200);

      await patch(`/boms/items/${bomA.body.data.items[0].id}`).send({ supplier: `합성공급사C1-${tag}`, unitPrice: 1234 }).expect(200);

      const bomAAfter = await get('/boms').query({ styleNo: styleA }).expect(200);
      expect(bomAAfter.body.data.items[0].supplier).toBe(`합성공급사C1-${tag}`);
      expect(Number(bomAAfter.body.data.items[0].unitPrice)).toBe(1234);

      // 다른 스타일(B, 같은 자재)의 행에는 영향 없음 — 공급업체/단가는 BomItem 소유.
      const bomBAfter = await get('/boms').query({ styleNo: styleB }).expect(200);
      expect(bomBAfter.body.data.items[0].supplier).toBeNull();
    });

    it('음수 단가는 거부한다', async () => {
      const styleNo = `PR241C2-${tag}`;
      await commitStyle(styleNo, `합성자재-C2-${tag}`);
      const bom = await get('/boms').query({ styleNo }).expect(200);
      await patch(`/boms/items/${bom.body.data.items[0].id}`).send({ unitPrice: -1 }).expect(400);
    });

    it('공급업체를 빈 문자열로 보내면 미정으로 해제된다', async () => {
      const styleNo = `PR241C3-${tag}`;
      await commitStyle(styleNo, `합성자재-C3-${tag}`);
      const bom = await get('/boms').query({ styleNo }).expect(200);
      const bomItemId = bom.body.data.items[0].id;
      await patch(`/boms/items/${bomItemId}`).send({ supplier: `합성공급사C3-${tag}` }).expect(200);
      await patch(`/boms/items/${bomItemId}`).send({ supplier: '' }).expect(200);
      const bomAfter = await get('/boms').query({ styleNo }).expect(200);
      expect(bomAfter.body.data.items[0].supplier).toBeNull();
    });
  });
});
