import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-mapping-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
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
        {
          id: 1,
          category: 'GENERAL',
          itemName: `E2E_MAPPING_MATERIAL_${Date.now()}`,
          consumption: 2,
          requiredQty: 1000,
          // PR-073: 매핑 커밋 페이로드가 혼용율/HS코드를 함께 보내면 그대로 저장되어야 한다.
          composition: 'WOOL 98%, POLYURETHANE 2%',
          hsCode: '6110.30',
        },
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
      // PR-073: composition/hsCode가 커밋 페이로드 그대로 저장되어야 한다.
      expect(bomItems[0].composition).toBe('WOOL 98%, POLYURETHANE 2%');
      expect(bomItems[0].hsCode).toBe('6110.30');
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

    // PR-073: 자재명세(BOM) 상세 화면에서 혼용율/HS코드를 인라인으로 수정하는 흐름.
    it('GET /boms로 조회한 BomItem에 혼용율/HS코드가 포함되고, PATCH /boms/items/:id로 수정할 수 있어야 한다', async () => {
      const bomRes = await request(app.getHttpServer())
        .get('/boms')
        .query({ styleNo })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const bomItem = bomRes.body.data.items[0];
      expect(bomItem.composition).toBe('WOOL 98%, POLYURETHANE 2%');
      expect(bomItem.hsCode).toBe('6110.30');

      const patchRes = await request(app.getHttpServer())
        .patch(`/boms/items/${bomItem.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ composition: 'COTTON 100%', hsCode: '5208.11' })
        .expect(200);
      expect(patchRes.body.data.composition).toBe('COTTON 100%');
      expect(patchRes.body.data.hsCode).toBe('5208.11');

      const reRes = await request(app.getHttpServer())
        .get('/boms')
        .query({ styleNo })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const updatedItem = reRes.body.data.items[0];
      expect(updatedItem.composition).toBe('COTTON 100%');
      expect(updatedItem.hsCode).toBe('5208.11');
    });
  });

  // PR-098: 같은 styleNo로 작업지시서/매핑이 두 번째로 들어와도 기존 자재명세를
  // 통째로 덮어쓰지 않고 "병합"해야 한다(실무에서 기존 BK 컬러는 유지, 신규 CR/BR
  // 컬러만 추가하던 실제 사례 재현).
  describe('/mapping/commit - 같은 styleNo 재커밋 시 병합 (PR-098)', () => {
    const styleNo = `E2E-MERGE-${Date.now()}`;
    const materialName = `E2E_MERGE_MATERIAL_${Date.now()}`;

    it('1차 커밋: BomItem 2개(BK/CR), factory=베트남으로 등록', async () => {
      await request(app.getHttpServer())
        .post('/mapping/commit')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          styleNo,
          overviewData: { styleNo, totalQty: 215, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
          bomItems: [
            { category: 'FABRIC', itemName: materialName, colorCode: 'BK', spec: '', consumption: 1, requiredQty: 215 },
            { category: 'FABRIC', itemName: materialName, colorCode: 'CR', spec: '', consumption: 1, requiredQty: 215 },
          ],
        })
        .expect(201);

      const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
      expect(bom).toHaveLength(1);
      const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
      expect(bomItems).toHaveLength(2);
    });

    it('2차 재커밋: 기존 BK/CR은 그대로 두고 신규 BR 컬러만 추가되고, factory 충돌은 반영되지 않는다', async () => {
      const res = await request(app.getHttpServer())
        .post('/mapping/commit')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          styleNo,
          overviewData: { styleNo, totalQty: 430, factory: '삼정', buyer: 'E2E바이어', shipDate: '' },
          bomItems: [
            // 기존과 동일한 조합 — 수량이 달라도 건드리면 안 됨.
            { category: 'FABRIC', itemName: materialName, colorCode: 'BK', spec: '', consumption: 9, requiredQty: 9999 },
            { category: 'FABRIC', itemName: materialName, colorCode: 'CR', spec: '', consumption: 1, requiredQty: 215 },
            // 신규 컬러 — 추가되어야 함.
            { category: 'FABRIC', itemName: materialName, colorCode: 'BR', spec: '', consumption: 1, requiredQty: 215 },
          ],
        })
        .expect(201);

      expect(res.body.data.warnings.some((w: string) => w.includes("기존 factory 값 '베트남' → 새 값 '삼정'"))).toBe(true);
      expect(res.body.data.warnings.some((w: string) => w.includes(`${materialName}(BK/N/A)`))).toBe(true);

      // (d) Bom row가 여전히 1개(중복 생성 안 됨).
      const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
      expect(bom).toHaveLength(1);

      // (a)+(b) 기존 BK/CR 2개는 그대로, 신규 BR 1개만 추가되어 총 3개.
      const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
      expect(bomItems).toHaveLength(3);
      const bk = bomItems.find((b: any) => b.colorCode === 'BK');
      expect(Number(bk.requiredQty)).toBe(215); // 9999로 안 바뀌고 1차 값 그대로.
      const br = bomItems.find((b: any) => b.colorCode === 'BR');
      expect(br).toBeDefined();
      expect(Number(br.requiredQty)).toBe(215);

      // (c) factory는 기존 '베트남' 그대로.
      const masterStyle = await dataSource.query('SELECT * FROM master_style WHERE styleNo = ?', [styleNo]);
      const overview = await dataSource.query('SELECT * FROM style_overview WHERE id = ?', [masterStyle[0].overviewId]);
      expect(overview[0].factory).toBe('베트남');
      // totalQty는 factory와 달리 예외가 없어 새 값(430)으로 갱신된다.
      expect(Number(overview[0].totalQty)).toBe(430);
    });
  });

  // PR-100: 안감(조바)류 자재의 혼용률(composition) 미기재 시 기본값("POLYESTER
  // 100%") 자동 적용 — 겉감(혼용률 기재)과 안감(미기재)을 함께 커밋해 안감만
  // 자동으로 채워지는지 확인한다(MB72BLM102Z_TEMP 실사례 재현).
  describe('/mapping/commit - 안감류 혼용률 기본값 자동 적용 (PR-100)', () => {
    const styleNo = `E2E-LINING-${Date.now()}`;
    const outerMaterialName = `E2E_OUTER_${Date.now()}`;
    const liningMaterialName = `E2E_LINING_${Date.now()}`;

    it('겉감(혼용률 기재)과 안감(혼용률 미기재)을 함께 커밋하면 안감만 기본값이 채워진다', async () => {
      const res = await request(app.getHttpServer())
        .post('/mapping/commit')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          styleNo,
          overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
          bomItems: [
            { category: 'FABRIC', itemName: outerMaterialName, consumption: 1, requiredQty: 100, composition: 'WOOL 98%, POLYURETHANE 2%' },
            { category: '안감', itemName: liningMaterialName, consumption: 1, requiredQty: 100 },
          ],
        })
        .expect(201);

      expect(res.body.data.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining(`안감 항목 '${liningMaterialName}' 혼용률 미기재 — 기본값 POLYESTER 100% 자동 적용`)]),
      );

      const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
      const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);

      const outerRow = await dataSource.query('SELECT id FROM items WHERE name = ?', [outerMaterialName]);
      const outerItem = bomItems.find((b: any) => b.materialId === outerRow[0].id);
      expect(outerItem.composition).toBe('WOOL 98%, POLYURETHANE 2%'); // 원래 값 그대로.

      const liningRow = await dataSource.query('SELECT id FROM items WHERE name = ?', [liningMaterialName]);
      const liningItem = bomItems.find((b: any) => b.materialId === liningRow[0].id);
      expect(liningItem.composition).toBe('POLYESTER 100%'); // 기본값 자동 적용.
    });
  });
});
