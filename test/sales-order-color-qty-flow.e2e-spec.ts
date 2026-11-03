import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-sales-order-color-qty-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-220b: sheetQty(작지 AI 인식, PR-220)가 없는 BOM 행이라도, 색상×사이즈 수량표(PR-212,
// 보통 MATERIAL LIST 엑셀 업로드에서 채워짐)에 그 색상의 합계가 있으면 스타일 전체
// 수량이 아니라 그 합계×요척을 쓴다. /mapping/commit(엑셀 매핑 경로와 같은 엔드포인트,
// 여기서는 실제 파일 업로드 없이 같은 모양의 합성 payload로 재현)으로 색상×사이즈
// 수량과 색상별 BOM 행을 함께 커밋한 뒤 GET /work-orders/style-requirements로 확인한다.
describe('색상×사이즈 수량표(colorQuantities) → 발주수량 계산 반영 (PR-220b)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `color-qty-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Color Qty E2E' });
    token = (
      await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const styleNo = `COLORQTY-${Date.now()}`;
  const blName = `BLUE_BL2_${Date.now()}`;
  const khName = `KHAKI_KH2_${Date.now()}`;

  it('엑셀 매핑 경로(/mapping/commit)로 색상×사이즈 수량(BL=760,KH=758)과 색상별 BOM 행(sheetQty 없음)을 커밋한다', async () => {
    const res = await request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo,
        overviewData: { styleNo, factory: '베트남', totalQty: 1518, buyer: 'Color Qty E2E Buyer', shipDate: '' },
        bomItems: [
          { category: '겉감', itemName: blName, spec: 'FABRIC', colorCode: 'BL', consumption: 1, requiredQty: 0, supplier: null, remarks: null },
          { category: '겉감', itemName: khName, spec: 'FABRIC', colorCode: 'KH', consumption: 1, requiredQty: 0, supplier: null, remarks: null },
        ],
        colorSizeQuantities: [
          { color: 'BL', size: 'FREE', qty: 760 },
          { color: 'KH', size: 'FREE', qty: 758 },
        ],
      })
      .expect(201);
    expect(res.body.data.success).toBe(true);
  });

  it('GET /work-orders/style-requirements — sheetQty 없이도 BL 760, KH 758(스타일 전체 1518이 아님), basis는 color-qty', async () => {
    const res = await request(app.getHttpServer())
      .get('/work-orders/style-requirements')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = res.body.data.rows as any[];
    const bl = rows.find((r) => r.itemName === blName);
    const kh = rows.find((r) => r.itemName === khName);
    expect(bl).toMatchObject({ requiredQty: 760, basis: 'color-qty', needsColorQty: false });
    expect(kh).toMatchObject({ requiredQty: 758, basis: 'color-qty', needsColorQty: false });
  });
});
