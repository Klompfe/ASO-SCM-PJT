import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-first-doc.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const DOCS = path.resolve(__dirname, '../docs');

// 실제 IV FOB/PK 레이아웃(라벨 바로 아래 칸에 값, Vessel/Departure date는 같은 행)을 합성으로 재현한다.
const row = (cells: Record<number, string | number>, width = 10) => {
  const r: Array<string | number> = new Array(width).fill('');
  for (const [i, v] of Object.entries(cells)) r[Number(i)] = v;
  return r;
};
const buildInvoice = (styleNos: string[]): Buffer => {
  const pre = (n: number, shift: number) => {
    const p = Array.from({ length: n }, () => row({}));
    p[1] = row({ 4: 'Invoice No.', 5: 'TYVN2026-FD-TEST' });
    p[2] = row({ 4: 'Date of Invoice', 5: '16/07/2026' });
    p[12 - shift] = row({ 0: 'Port of Loading', 2: 'Final Destination' });
    p[13 - shift] = row({ 0: 'HAIPHONG, VIETNAM', 2: 'INCHEON , KOREA' });
    p[14 - shift] = row({ 0: 'Carrier' });
    p[15 - shift] = row({ 0: 'BY SEA' });
    p[16 - shift] = row({ 0: 'Vessel', 2: 'Departure date' });
    p[17 - shift] = row({ 0: 'STARSHIP TAURUS 2613N', 2: '19/07/2026' });
    return p;
  };
  const iv = [...pre(19, 0), row({ 0: 'Description', 1: 'Style No.', 2: 'Quantity\r\n(PCS)', 3: 'Unit', 4: 'Fob /Price', 5: 'Amount', 6: 'HS CODE' }),
    ...styleNos.map((s) => row({ 0: "WOMEN'S PANTS", 1: s, 2: 100, 3: 'PCS', 4: 5, 5: 500, 6: '6204.63.0000' })), row({ 0: 'TOTAL', 2: 100 * styleNos.length, 5: 500 * styleNos.length })];
  const pk = [...pre(18, 1), row({ 0: 'Description', 1: 'Style No.', 2: 'Quantity\r\n(PCS)', 3: 'Packages', 4: 'Gross Weight\r\n(Kgs)', 5: 'Volume\r\n(Cbm)' }),
    ...styleNos.map((s) => row({ 0: "WOMEN'S PANTS", 1: s, 2: 100, 3: 'HANGER', 4: 60 })), row({ 0: 'TOTAL', 2: 100 * styleNos.length, 4: 60 * styleNos.length })];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(iv), 'IV FOB');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(pk), 'PK');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

// PR-124: 최초 자료화 — 아직 MasterStyle에 없는 스타일번호도 수동 등록/엑셀 업로드 양쪽에서 그대로 자료화되고,
// ETD/POD 등 선적 정보가 저장되며, 나중에 정식 오더(엑셀 매핑 커밋)가 같은 스타일에 병합된다.
describe('수입선적서류 — 미등록 스타일 최초 자료화 + 선적 정보 (PR-124)', () => {
  let app: INestApplication;
  let token: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const stamp = Date.now();
  const manualStyle = `FD-MANUAL-${stamp}`;
  const uploadStyle = `FD-UPLOAD-${stamp}`;

  const findStyles = async (styleNo: string) => {
    const body = (await auth(request(app.getHttpServer()).get('/master-styles').query({ styleNo })).expect(200)).body.data;
    return (Array.isArray(body) ? body : body.items).filter((s: any) => s.styleNo === styleNo);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `fd-e2e-${stamp}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'FD E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('수동 등록: 미등록 스타일번호로도 생성되고 MasterStyle 스텁이 함께 만들어지며 POL/POD/ETD/ETA/선명이 저장된다', async () => {
    expect(await findStyles(manualStyle)).toHaveLength(0);
    const res = await auth(request(app.getHttpServer()).post('/import-shipments'))
      .send({
        styleNo: manualStyle, invoiceNo: 'TYVN2026-FD-1', invoiceDate: '2026-07-16',
        pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', etd: '2026-07-19', eta: '2026-07-24', vessel: 'STARSHIP TAURUS 2613N',
        lines: [{ itemType: "WOMEN'S JACKET", qty: 10, unit: 'EA' }],
      })
      .expect(201);
    expect(res.body.data).toMatchObject({ styleNo: manualStyle, styleAutoCreated: true, pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', vessel: 'STARSHIP TAURUS 2613N' });
    expect(String(res.body.data.etd)).toContain('2026-07-19');
    expect(String(res.body.data.eta)).toContain('2026-07-24');
    expect(await findStyles(manualStyle)).toHaveLength(1);
  });

  it('같은 미등록 스타일로 다시 등록하면 스타일을 또 만들지 않는다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/import-shipments'))
      .send({ styleNo: manualStyle, lines: [{ itemType: 'JK', qty: 1, unit: 'EA' }] })
      .expect(201);
    expect(res.body.data.styleAutoCreated).toBe(false);
    expect(await findStyles(manualStyle)).toHaveLength(1);
  });

  it('ETA가 ETD보다 빠르면 400이고 아무것도 만들지 않는다', async () => {
    const styleNo = `FD-BAD-${stamp}`;
    await auth(request(app.getHttpServer()).post('/import-shipments'))
      .send({ styleNo, etd: '2026-07-19', eta: '2026-07-01', lines: [{ itemType: 'JK', qty: 1, unit: 'EA' }] })
      .expect(400);
    expect(await findStyles(styleNo)).toHaveLength(0);
  });

  it('엑셀 업로드: 미등록 스타일도 자동 등록되어 자료화되고, 헤더의 POL/POD/ETD/선명이 채워지며 ETA는 비어 있다', async () => {
    const res = await auth(request(app.getHttpServer()).post('/import-shipments/import-from-file'))
      .attach('file', buildInvoice([uploadStyle]), 'invoice.xlsx')
      .expect(201);
    const [shipment] = res.body.data.shipments;
    expect(shipment.styleNo).toBe(uploadStyle);
    expect(shipment).toMatchObject({ pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', vessel: 'STARSHIP TAURUS 2613N' });
    expect(String(shipment.etd)).toContain('2026-07-19');
    expect(shipment.eta ?? null).toBeNull();
    expect(res.body.data.warnings.some((w: string) => w.includes(uploadStyle) && w.includes('자동 등록'))).toBe(true);
    expect(await findStyles(uploadStyle)).toHaveLength(1);
  });

  it('실제 파일(TYVN2026-21)을 올려도 POD/ETD가 실제 값으로 저장된다(스타일은 전부 자동 등록)', async () => {
    const file = path.join(DOCS, 'TYVN2026-21(검토완료).xlsx');
    const res = await auth(request(app.getHttpServer()).post('/import-shipments/import-from-file')).attach('file', fs.readFileSync(file), 'upload.xlsx').expect(201);
    expect(res.body.data.shipments.length).toBeGreaterThan(0);
    for (const s of res.body.data.shipments) {
      expect(s).toMatchObject({ pol: 'HAIPHONG, VIETNAM', pod: 'INCHEON , KOREA', vessel: 'STARSHIP TAURUS 2613N' });
      expect(String(s.etd)).toContain('2026-07-19');
    }
    // 데이터가 통째로 누락되지 않았다: 파일의 스타일 수만큼 문서가 생성됨(이전에는 미등록 스타일이 전부 건너뛰어졌다)
    expect(res.body.data.warnings.filter((w: string) => w.includes('자동 등록')).length).toBe(res.body.data.shipments.length);
  });

  it('등록 후 선적 정보를 수정할 수 있다: ETA 입력, 값 지우기, 보내지 않은 필드는 유지, ETA<ETD는 400', async () => {
    const list = (await auth(request(app.getHttpServer()).get('/import-shipments').query({ styleNo: uploadStyle })).expect(200)).body.data;
    const id = list[0].id;
    const patched = (await auth(request(app.getHttpServer()).patch(`/import-shipments/${id}`)).send({ eta: '2026-07-25' }).expect(200)).body.data;
    expect(String(patched.eta)).toContain('2026-07-25');
    expect(patched.pod).toBe('INCHEON , KOREA'); // 유지
    expect(String(patched.etd)).toContain('2026-07-19');

    const cleared = (await auth(request(app.getHttpServer()).patch(`/import-shipments/${id}`)).send({ pod: null, vessel: '' }).expect(200)).body.data;
    expect(cleared.pod).toBeNull();
    expect(cleared.vessel).toBeNull();

    await auth(request(app.getHttpServer()).patch(`/import-shipments/${id}`)).send({ eta: '2026-07-01' }).expect(400);
    await auth(request(app.getHttpServer()).patch(`/import-shipments/${id}`)).send({ etd: 'not-a-date' }).expect(400);
    await auth(request(app.getHttpServer()).patch('/import-shipments/999999')).send({ pod: 'X' }).expect(404);
  });

  it('나중에 같은 스타일번호로 정식 오더 매핑 커밋을 하면 스텁에 병합된다(에러 없음, 스타일 중복 없음, 수입통관 문서 유지)', async () => {
    const before = (await auth(request(app.getHttpServer()).get('/import-shipments').query({ styleNo: manualStyle })).expect(200)).body.data;
    expect(before.length).toBeGreaterThan(0);
    expect(before[0].style?.overview ?? null).toBeNull(); // 스텁: overview 없음

    await auth(request(app.getHttpServer()).post('/mapping/commit'))
      .send({
        styleNo: manualStyle,
        overviewData: { styleNo: manualStyle, totalQty: 500, factory: '베트남', buyer: 'FD바이어', shipDate: '' },
        bomItems: [{ itemName: 'FD 원단', category: '겉감', colorCode: 'BK', spec: '', consumption: 1.5, requiredQty: 750 }],
      })
      .expect(201);

    const styles = await findStyles(manualStyle);
    expect(styles).toHaveLength(1); // 새 스타일이 또 생기지 않는다
    expect(styles[0].overview?.buyer).toBe('FD바이어'); // 스텁에 overview가 채워졌다
    const bom = (await auth(request(app.getHttpServer()).get('/boms').query({ styleNo: manualStyle })).expect(200)).body.data;
    expect(bom.items).toHaveLength(1);
    // 수입통관 문서는 그대로 남아 있고 이제 overview와 연결되어 보인다
    const after = (await auth(request(app.getHttpServer()).get('/import-shipments').query({ styleNo: manualStyle })).expect(200)).body.data;
    expect(after.map((s: any) => s.id).sort()).toEqual(before.map((s: any) => s.id).sort());
    expect(after.every((x: any) => x.style.overview.buyer === 'FD바이어')).toBe(true);
    expect(after.find((x: any) => x.pod)?.pod).toBe('INCHEON , KOREA'); // 선적 정보도 유지(첫 번째 문서)
  });
});
