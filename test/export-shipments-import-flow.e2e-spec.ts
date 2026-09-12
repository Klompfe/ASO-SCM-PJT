import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-export-shipments-import-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User, UserRole } from '../src/users/entities/user.entity';

const SAMPLE_XLSX_PATH = path.resolve(
  __dirname,
  '../docs/TY-260718K 수출 인천-하이퐁 FCL(INVOICE, PACKING LIST)-TY (2).xlsx',
);

describe('수출선적서류 기 작성 엑셀 가져오기(import) 회귀 테스트 (PR-080)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

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
    dataSource = app.get(DataSource);

    const userEmail = `import-e2e-user-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123!', name: 'Import E2E User' });
    userToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;

    const managerEmail = `import-e2e-manager-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: managerEmail, password: 'password123!', name: 'Import E2E Manager' });
    await dataSource.getRepository(User).update({ email: managerEmail }, { role: UserRole.MANAGER });
    managerToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: managerEmail, password: 'password123!' })
        .expect(201)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('PR-079 기본값 미설정 상태에서 가져오기', () => {
    it('(a)(b)(c) 실제 원본 파일을 가져오면 82개 라인이 전부 파싱되고, HS코드 10건이 분리되고, 단위 불일치 4건이 경고로 포함되어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.source).toBe('IMPORTED');
      expect(res.body.data.lines).toHaveLength(82);

      // (b) 실제 파일에서 직접 정규식으로 확인한 값과 동일해야 한다(10건).
      const linesWithHsCode = res.body.data.lines.filter((l: any) => l.hsCode);
      expect(linesWithHsCode).toHaveLength(10);

      // (c) 실제 파일에서 82행 중 4행(모두 표 끝의 공란 채움 행)은 INVOICE 단위 칸이
      // 빈 문자열, Packing List는 숫자 0이라 서로 달라 경고로 남아야 한다.
      expect(res.body.data.warnings.length).toBeGreaterThanOrEqual(4);
      const unitWarnings = res.body.data.warnings.filter((w: string) => w.includes('단위 불일치'));
      expect(unitWarnings).toHaveLength(4);

      // 첫 줄 — description/hsCode 분리가 PR-075 generate()와 동일한 형식이어야 한다.
      const first = res.body.data.lines[0];
      expect(first.styleNo).toBe('BF6X27C51');
      expect(first.description).toBe('53" FOR THE FACE WOOL 98%, POLYURETHANE 2%');
      expect(first.hsCode).toBe('6202.20.1000');
      expect(Number(first.qty)).toBeCloseTo(3950.44);
      expect(first.unit).toBe('MTS');
      expect(Number(first.unitPrice)).toBeCloseTo(1.5);
      expect(Number(first.amount)).toBeCloseTo(5925.66);
      expect(Number(first.netWeight)).toBeCloseTo(1446);
      expect(Number(first.grossWeight)).toBeCloseTo(1474.92);
      expect(first.packageCount).toBe(52);
      expect(first.packageType).toBe('BALE');
      // 재계산 금지 — qty*unitPrice(5925.66)와 amount가 우연히 같아 보이더라도, 이는
      // 서버가 계산한 게 아니라 파일의 AMOUNT(USD) 컬럼 값을 그대로 저장한 것이다.
      expect(first.packingReceiptId).toBeNull();

      // 헤더 고정 위치 파싱 확인.
      expect(res.body.data.sheetNo).toBe('TY-260704K');
      expect(res.body.data.invoiceDate).toBe('2026-07-04');
      expect(res.body.data.portOfLoading).toBe('INCHEON, KOREA');
      expect(res.body.data.finalDestination).toBe('HAIPHONG, VIETNAM');
      expect(res.body.data.carrier).toBe('DONGJIN CONTINENTAL / 0217W');
      expect(res.body.data.sailingDate).toBe('2026-07-04');

      // PR-079 기본값이 아직 설정된 적 없으므로 shipper/consignee는 공란이어야 한다.
      expect(res.body.data.shipperInfo).toBeNull();
      expect(res.body.data.consigneeInfo).toBeNull();
    });

    it('여러 스타일이 styleNos 배열에 전부 포함되어야 한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);

      expect(res.body.data.styleNos).toEqual(expect.arrayContaining(['BF6X27C51', 'BF6X21C52', 'BF6X21C63']));
      expect(res.body.data.styleNos.length).toBeGreaterThan(5);
    });

    it('가져온 문서도 기존 DRAFT→REVIEWED→FINALIZED 상태전이를 그대로 따라야 한다', async () => {
      const importRes = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);
      const id = importRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/export-shipments/${id}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'REVIEWED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/export-shipments/${id}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'FINALIZED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/export-shipments/${id}/lines/${importRes.body.data.lines[0].id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ unitPrice: 9.99 })
        .expect(400);
    });
  });

  describe('(d) 시트 간 데이터 행 수 불일치', () => {
    it('INVOICE와 Packing List의 데이터 행 수가 다르면 조용히 합치지 않고 명확한 400 에러를 반환해야 한다', async () => {
      // 실제 샘플 파일을 메모리에서 열어 Packing List 시트의 데이터 행 하나를
      // 삭제해(TOTAL 행 이전) 두 시트의 행 수가 어긋나는 파일을 즉석에서 만든다.
      const buffer = fs.readFileSync(SAMPLE_XLSX_PATH);
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const ws = workbook.Sheets['Packing List'];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
      rows.splice(35, 1); // 헤더(33) 바로 다음 데이터 행(34) 다음 행 하나를 제거
      const newWs = xlsx.utils.aoa_to_sheet(rows);
      workbook.Sheets['Packing List'] = newWs;
      const brokenBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', brokenBuffer, 'broken.xlsx')
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('행 수');
    });
  });

  describe('인식할 수 없는 양식', () => {
    it('INVOICE/Packing List 시그니처가 없는 파일을 올리면 400으로 안내해야 한다', async () => {
      const unrecognizedPath = path.resolve(__dirname, '../docs/26-SS 미센스 Material List Update 12. 08.xlsx');
      const res = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', unrecognizedPath)
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('찾지 못했습니다');
    });
  });

  describe('(e) PR-079 기본값이 설정되어 있는 상태에서 가져오기', () => {
    it('ExportShipmentDefaults가 설정되어 있으면 shipper/consignee가 그 값으로 자동 채워져야 한다', async () => {
      await request(app.getHttpServer())
        .put('/export-shipment-defaults')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          shipperInfo: 'TAE IL TRADING CO.,LTD',
          consigneeInfo: 'TAE IL VN COMPANY LIMITED',
          portOfLoading: 'DEFAULT PORT (should be overridden by file)',
          finalDestination: 'DEFAULT DEST (should be overridden by file)',
          carrier: 'DEFAULT CARRIER (should be overridden by file)',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/export-shipments/import-from-file')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', SAMPLE_XLSX_PATH)
        .expect(201);

      expect(res.body.data.shipperInfo).toBe('TAE IL TRADING CO.,LTD');
      expect(res.body.data.consigneeInfo).toBe('TAE IL VN COMPANY LIMITED');
      // portOfLoading/finalDestination/carrier는 파일에서 직접 읽은 고정 위치 값이
      // 기본값보다 우선해야 한다 — 파일 자체가 이미 완성된 문서이기 때문이다.
      expect(res.body.data.portOfLoading).toBe('INCHEON, KOREA');
      expect(res.body.data.finalDestination).toBe('HAIPHONG, VIETNAM');
      expect(res.body.data.carrier).toBe('DONGJIN CONTINENTAL / 0217W');
    });
  });
});
