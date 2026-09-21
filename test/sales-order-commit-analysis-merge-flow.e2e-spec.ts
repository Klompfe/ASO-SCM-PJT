import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-sales-order-commit-analysis-merge-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-098: 작업지시서 AI 분석 커밋(commit-analysis, mapping-commit.service.ts의 병합
// 로직을 그대로 공유하는 경로) 쪽에서도 같은 styleNo를 두 번째로 커밋했을 때 기존
// 자재명세를 지우지 않고 병합하는지, 그리고 warnings가 응답에 실려 오는지 확인한다.
describe('작업지시서 AI 분석 커밋 — 재커밋 시 병합 (PR-098)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;

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
    dataSource = moduleFixture.get(DataSource);

    const email = `wo-merge-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'WO Merge E2E' });
    jwtToken = (
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

  const styleNo = `WO-MERGE-${Date.now()}`;
  const materialName = `WO_MERGE_MATERIAL_${Date.now()}`;

  it('1차 커밋: BomItem 1개(BK), factory=베트남, supplier 미기재(null)로 등록', async () => {
    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        overview: {
          styleNo, styleName: null, itemType: 'PANTS', brand: null, productionType: null,
          factory: '베트남', buyer: 'WO Merge Buyer', totalQty: 215, targetRdd: null,
        },
        bomItems: [
          { category: 'FABRIC', itemName: materialName, spec: null, colorCode: 'BK', consumption: 1, requiredQty: 215, supplier: null, remarks: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    expect(bom).toHaveLength(1);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(1);
    // PR-098: supplier를 문서에서 못 읽었으면 'N/A' 문자열이 아니라 진짜 null로 저장되어야 한다.
    expect(bomItems[0].supplier).toBeNull();
  });

  it('2차 커밋: 기존 BK는 유지되고 신규 CR 컬러만 추가되며, 응답에 warnings가 포함된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        overview: {
          styleNo, styleName: null, itemType: 'PANTS', brand: null, productionType: null,
          factory: '삼정', buyer: 'WO Merge Buyer', totalQty: 430, targetRdd: null,
        },
        bomItems: [
          { category: 'FABRIC', itemName: materialName, spec: null, colorCode: 'BK', consumption: 9, requiredQty: 9999, supplier: null, remarks: null },
          { category: 'FABRIC', itemName: materialName, spec: null, colorCode: 'CR', consumption: 1, requiredQty: 215, supplier: null, remarks: null },
        ],
        sizeSpecs: [],
        workNotes: null,
      })
      .expect(201);

    expect(res.body.data.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("기존 factory 값 '베트남' → 새 값 '삼정'")]),
    );

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    expect(bom).toHaveLength(1); // Bom 중복 생성 안 됨.

    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(2); // 기존 BK + 신규 CR.
    const bk = bomItems.find((b: any) => b.colorCode === 'BK');
    expect(Number(bk.requiredQty)).toBe(215); // 9999로 안 바뀜.

    const masterStyle = await dataSource.query('SELECT * FROM master_style WHERE styleNo = ?', [styleNo]);
    const overview = await dataSource.query('SELECT * FROM style_overview WHERE id = ?', [masterStyle[0].overviewId]);
    expect(overview[0].factory).toBe('베트남'); // 자동 반영 안 됨.
  });
});
