import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-sales-order-sheet-qty-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-220: 작업지시서(작지)에 인쇄된 BOM 행별 수량(sheetQty)이 commit-analysis(수주 등록)를
// 거쳐 저장되고, 발주수량 계산(GET /work-orders/style-requirements)이 그 값을 색상별로
// 정확히 반영하는지 — 사용자 보고(스타일 겉감 BL/KH, 작지 760/758, 그런데 화면엔 스타일
// 전체 물량 1518이 양쪽 다 뜨던 버그)와 같은 모양으로 재현·검증한다.
describe('작업지시서 작지 수량(sheetQty) → 발주수량 계산 반영 (PR-220)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `sheet-qty-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Sheet Qty E2E' });
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const styleNo = `SHEETQTY-${Date.now()}`;
  const blName = `BLUE_BL_${Date.now()}`;
  const khName = `KHAKI_KH_${Date.now()}`;

  it('작지 업로드(가정) → 커밋: 겉감 BL/KH 두 품목에 작지 수량(sheetQty) 760/758을 함께 저장한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo, styleName: null, itemType: 'JACKET', brand: null, productionType: null,
          factory: '베트남', buyer: 'Sheet Qty E2E Buyer', totalQty: 1518, targetRdd: null,
        },
        bomItems: [
          // mapping-commit.service.ts가 신규 Item을 만들 때 unit 기본값이 'EA'라서
          // (품목 마스터 재설정 없이 바로 단위가 일치하도록) requiredQtyUnit도 'EA'로
          // 맞춘다 — 운영에서는 자재 마스터의 실제 단위에 맞는 값이 들어온다.
          { category: '겉감', itemName: blName, spec: 'FABRIC', colorCode: 'BL', consumption: 1, requiredQty: 760, requiredQtyUnit: 'EA', supplier: null, remarks: null },
          { category: '겉감', itemName: khName, spec: 'FABRIC', colorCode: 'KH', consumption: 1, requiredQty: 758, requiredQtyUnit: 'EA', supplier: null, remarks: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);
    expect(Array.isArray(res.body.data.warnings)).toBe(true);
  });

  it('GET /work-orders/style-requirements — BL 760, KH 758(둘 다 1,518이 아님), basis는 sheet', async () => {
    const res = await request(app.getHttpServer())
      .get('/work-orders/style-requirements')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = res.body.data.rows as any[];
    const bl = rows.find((r) => r.itemName === blName);
    const kh = rows.find((r) => r.itemName === khName);
    expect(bl).toBeDefined();
    expect(kh).toBeDefined();
    expect(bl.requiredQty).toBe(760);
    expect(kh.requiredQty).toBe(758);
    expect(bl.requiredQty).not.toBe(1518);
    expect(kh.requiredQty).not.toBe(1518);
    expect(bl.basis).toBe('sheet');
    expect(kh.basis).toBe('sheet');
  });

  it('재업로드(같은 스타일, 수량만 수정): 기존 BomItem의 sheetQty만 갱신되고 계산에 바로 반영된다', async () => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: { styleNo, styleName: null, itemType: 'JACKET', brand: null, productionType: null, factory: '베트남', buyer: 'Sheet Qty E2E Buyer', totalQty: 1518, targetRdd: null },
        bomItems: [
          { category: '겉감', itemName: blName, spec: 'FABRIC', colorCode: 'BL', consumption: 1, requiredQty: 765, requiredQtyUnit: 'EA', supplier: null, remarks: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/work-orders/style-requirements')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data.rows as any[];
    const bl = rows.find((r) => r.itemName === blName);
    expect(bl.requiredQty).toBe(765); // 갱신된 작지 수량
  });
});
