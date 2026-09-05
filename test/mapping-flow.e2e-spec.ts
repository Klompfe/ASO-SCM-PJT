import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-mapping-flow.sqlite');
process.env.DB_DATABASE = TEST_DB_PATH;

import * as xlsx from 'xlsx';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const SOURCE_XLSX_PATH = path.resolve(__dirname, '../docs/26-SS 미센스 Material List Update 12. 08.xlsx');

describe('자재명세 업로드/커밋 회귀 테스트 (PR-025/026/028/029/031)', () => {
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

    const email = `mapping-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Mapping E2E' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123!' })
      .expect(201);
    jwtToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('/mapping/parse - 다중 시트 처리 (PR-028, PR-029)', () => {
    it('48개 시트 원본 업로드 시 배열로 응답하고 빈 템플릿 9개는 제외해 정확히 39개만 반환해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/mapping/parse')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', SOURCE_XLSX_PATH)
        .expect(201);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(39);
      expect(res.body.data.every((s: any) => !s.sheetName.startsWith('Sheet'))).toBe(true);

      const first = res.body.data.find((s: any) => s.sheetName === 'MB62SLM103Z');
      expect(first).toBeDefined();
      expect(first.matchStatus).toBeNull();
      expect(first.overview).toEqual(
        expect.objectContaining({ styleNo: 'MB62SLM103Z', totalQty: 700, factory: '베트남', buyer: '미도컴퍼니' }),
      );
      expect(first.bomItems.length).toBeGreaterThan(0);
      expect(first.parseError).toBeUndefined();
    });

    it('한 시트만 의도적으로 손상시키면 그 시트만 parseError로 표시되고 나머지 38개는 정상 처리되어야 한다', async () => {
      const buffer = fs.readFileSync(SOURCE_XLSX_PATH);
      const workbook = xlsx.read(buffer, { type: 'buffer' });

      // MB64SLM123Z 시트의 QTY 값 자리(row1, col8)에 레이블 문자열을 덮어써 헤더 레이아웃을 깨뜨린다.
      const targetSheet = 'MB64SLM123Z';
      const ws = workbook.Sheets[targetSheet];
      const valueAddr = xlsx.utils.encode_cell({ r: 1, c: 8 });
      const labelAddr = xlsx.utils.encode_cell({ r: 1, c: 7 });
      ws[valueAddr] = { t: 's', v: ws[labelAddr].v };

      const brokenBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app.getHttpServer())
        .post('/mapping/parse')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', brokenBuffer, 'broken.xlsx')
        .expect(201);

      expect(res.body.data).toHaveLength(39);

      const broken = res.body.data.find((s: any) => s.sheetName === targetSheet);
      expect(broken.parseError).toBeDefined();
      expect(broken.bomItems).toBeUndefined();

      const normalCount = res.body.data.filter((s: any) => !s.parseError).length;
      expect(normalCount).toBe(38);
    });
  });

  describe('/mapping/commit - check-exists 및 실제 저장 (PR-025, PR-026, PR-031)', () => {
    const styleNo = `E2E-MAPPING-${Date.now()}`;
    const commitPayload = {
      styleNo,
      overviewData: { styleNo, totalQty: 500, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [
        { id: 1, category: 'GENERAL', itemName: `E2E_MAPPING_MATERIAL_${Date.now()}`, consumption: 2, requiredQty: 1000 },
      ],
    };

    it('아직 등록되지 않은 styleNo는 check-exists가 false를 반환해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/mapping/check-exists')
        .query({ styleNo })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(res.body.data.exists).toBe(false);
    });

    it('정상 커밋 후 master_style/style_overview/bom_master/bom_item_details 4개 테이블에 실제로 저장되어야 한다', async () => {
      await request(app.getHttpServer())
        .post('/mapping/commit')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(commitPayload)
        .expect(201);

      const masterStyle = await dataSource.query('SELECT * FROM master_style WHERE styleNo = ?', [styleNo]);
      expect(masterStyle).toHaveLength(1);

      const overview = await dataSource.query(
        'SELECT * FROM style_overview WHERE id = ?',
        [masterStyle[0].overviewId],
      );
      expect(overview).toHaveLength(1);
      expect(overview[0]).toEqual(
        expect.objectContaining({ factory: '베트남', totalQty: 500, buyer: 'E2E바이어' }),
      );

      const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
      expect(bom).toHaveLength(1);

      const bomItems = await dataSource.query(
        'SELECT * FROM bom_item_details WHERE bomId = ?',
        [bom[0].id],
      );
      expect(bomItems).toHaveLength(1);
      expect(Number(bomItems[0].consumption)).toBe(2);
    });

    it('커밋 후에는 같은 styleNo에 대해 check-exists가 true를 반환해야 한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/mapping/check-exists')
        .query({ styleNo })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(res.body.data.exists).toBe(true);
    });

    it('styleNo 쿼리 파라미터 없이 check-exists를 호출하면 400이어야 한다', async () => {
      await request(app.getHttpServer())
        .get('/mapping/check-exists')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(400);
    });
  });
});
