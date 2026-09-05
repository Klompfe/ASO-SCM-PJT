import * as path from 'path';
import * as fs from 'fs';

// 다른 e2e 파일과 동시에 실행돼도 안전하도록, 그리고 개발용 scm_db.sqlite를 오염시키지
// 않도록 이 파일 전용의 격리된 sqlite DB를 사용한다(app.module.ts가 ConfigService로
// DB_DATABASE를 읽으므로, 모듈이 컴파일되기 전에 지정하면 된다).
const TEST_DB_PATH = path.resolve(__dirname, '../test-db-inventory-flow.sqlite');
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// docs/작업목록_ASO-SCM-PJT_긴급개선사항.md의 "8. 회귀 방지용 E2E 테스트 보강"(P2)이
// 요구하는 세 가지 핵심 재고 연동 흐름을 실제 HTTP 요청(mock 없이)으로 검증한다.
describe('Inventory 연동 회귀 테스트 (PO RECEIVED / WO COMPLETED)', () => {
  let app: INestApplication;
  let jwtToken: string;

  const register = async (email: string) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Inventory E2E' });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123!' })
      .expect(201);
    return res.body.data.accessToken;
  };

  const createItem = async (body: any) => {
    const res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body)
      .expect(201);
    return res.body.data.id as number;
  };

  const createSupplier = async () => {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        code: `SUP_INV_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: 'Inventory E2E 공급사',
        email: 'inv-e2e@supplier.com',
        contactPhone: '010-0000-0000',
      })
      .expect(201);
    return res.body.data.id as number;
  };

  const createPo = async (supplierId: number, itemId: number, quantity: number) => {
    const res = await request(app.getHttpServer())
      .post('/purchase-orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ supplierId, itemId, quantity, unitPrice: 10 })
      .expect(201);
    return res.body.data.id as number;
  };

  const receivePo = (poId: number) =>
    request(app.getHttpServer())
      .patch(`/purchase-orders/${poId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'RECEIVED' });

  const getInventoryQuantity = async (itemId: number): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get('/inventories')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const list = Array.isArray(res.body.data) ? res.body.data : res.body.data.items;
    const row = list.find((inv: any) => inv.itemId === itemId);
    return row ? Number(row.quantity) : 0;
  };

  const commitStyle = (styleNo: string, bomItems: any[], totalQty = 100) =>
    request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        styleNo,
        overviewData: { styleNo, totalQty, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
        bomItems,
      })
      .expect(201);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    jwtToken = await register(`inv-e2e-${Date.now()}@test.com`);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('PO RECEIVED → 해당 품목의 Inventory가 정확히 발주 수량만큼 증가해야 한다 (PR-010)', async () => {
    const supplierId = await createSupplier();
    const itemId = await createItem({
      code: `RAW_PO_${Date.now()}`,
      name: 'E2E PO 원자재',
      type: 'RAW_MATERIAL',
    });

    expect(await getInventoryQuantity(itemId)).toBe(0);

    const poId = await createPo(supplierId, itemId, 150);
    await receivePo(poId).expect(200);

    expect(await getInventoryQuantity(itemId)).toBe(150);

    // 같은 품목에 대해 한 번 더 입고하면 누적되어야 한다.
    const poId2 = await createPo(supplierId, itemId, 50);
    await receivePo(poId2).expect(200);
    expect(await getInventoryQuantity(itemId)).toBe(200);
  });

  it('WO COMPLETED → BOM 기반 원자재 차감 + 완제품 가산, 같은 style에 Bom이 여러 개면 최신(id DESC) 것을 사용해야 한다 (PR-005, PR-008)', async () => {
    const styleNo = `E2E-STYLE-${Date.now()}`;
    const materialName = `E2E_BOM_MATERIAL_${Date.now()}`;

    const supplierId = await createSupplier();
    const materialItemId = await createItem({
      code: `RAW_BOM_${Date.now()}`,
      name: materialName,
      type: 'RAW_MATERIAL',
    });
    const finishedItemId = await createItem({
      code: `FIN_BOM_${Date.now()}`,
      name: 'E2E BOM 완제품',
      type: 'FINISHED_GOOD',
      styleNo,
    });

    // 1차 Bom 커밋(소요량 1) — 의도적으로 먼저 만들어 "옛 Bom"으로 남긴다.
    await commitStyle(styleNo, [
      { id: 1, category: 'GENERAL', itemName: materialName, consumption: 1, requiredQty: 100 },
    ]);

    // 2차 Bom 커밋(소요량 3) — 같은 styleNo로 다시 커밋하면 Bom이 새로 하나 더 생성되는
    // 알려진 이슈(CHARTER.md)가 있고, 소비 측은 항상 id DESC(최신) 하나만 써야 한다.
    await commitStyle(styleNo, [
      { id: 1, category: 'GENERAL', itemName: materialName, consumption: 3, requiredQty: 300 },
    ]);

    // 최신 Bom(소요량 3) 기준으로 targetQuantity(10)만큼 필요한 원자재 = 30. 여유 있게 입고.
    const poId = await createPo(supplierId, materialItemId, 100);
    await receivePo(poId).expect(200);
    expect(await getInventoryQuantity(materialItemId)).toBe(100);

    const woRes = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ itemId: finishedItemId, targetQuantity: 10 })
      .expect(201);
    const woId = woRes.body.data.id;

    const completeRes = await request(app.getHttpServer())
      .patch(`/work-orders/${woId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');

    // 옛 Bom(소요량 1)을 썼다면 100-10=90이 되어버린다. 최신 Bom(소요량 3)을 썼어야
    // 100 - (3*10) = 70 이 되므로, 이 값으로 "최신 Bom 선택"을 검증한다.
    expect(await getInventoryQuantity(materialItemId)).toBe(70);
    expect(await getInventoryQuantity(finishedItemId)).toBe(10);
  });

  it('원자재 재고가 부족하면 WO 완료가 400으로 실패하고 재고는 변경되지 않아야 한다 (PR-005)', async () => {
    const styleNo = `E2E-SHORTAGE-${Date.now()}`;
    const materialName = `E2E_SHORTAGE_MATERIAL_${Date.now()}`;

    const materialItemId = await createItem({
      code: `RAW_SHORT_${Date.now()}`,
      name: materialName,
      type: 'RAW_MATERIAL',
    });
    const finishedItemId = await createItem({
      code: `FIN_SHORT_${Date.now()}`,
      name: 'E2E 재고부족 완제품',
      type: 'FINISHED_GOOD',
      styleNo,
    });

    await commitStyle(styleNo, [
      { id: 1, category: 'GENERAL', itemName: materialName, consumption: 5, requiredQty: 500 },
    ]);

    // 입고를 아예 하지 않아 원자재 재고가 0인 상태로 둔다 — targetQuantity 10 * consumption 5 = 50 필요.
    expect(await getInventoryQuantity(materialItemId)).toBe(0);

    const woRes = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ itemId: finishedItemId, targetQuantity: 10 })
      .expect(201);
    const woId = woRes.body.data.id;

    const failRes = await request(app.getHttpServer())
      .patch(`/work-orders/${woId}/status`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ status: 'COMPLETED' })
      .expect(400);
    // AllExceptionsFilter가 HttpException.getResponse()를 그대로 message에 담으므로
    // BadRequestException(문자열)의 실제 메시지는 message.message에 중첩되어 있다.
    expect(failRes.body.message?.message ?? failRes.body.message).toContain('재고가 부족');

    // 롤백 확인: 원자재/완제품 재고 모두 변경되지 않아야 하고, WO 상태도 PENDING 그대로여야 한다.
    expect(await getInventoryQuantity(materialItemId)).toBe(0);
    expect(await getInventoryQuantity(finishedItemId)).toBe(0);

    const woAfter = await request(app.getHttpServer())
      .get(`/work-orders/${woId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(woAfter.body.data.status).toBe('PENDING');
  });
});
