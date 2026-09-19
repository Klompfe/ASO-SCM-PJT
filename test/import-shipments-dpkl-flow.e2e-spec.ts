import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-import-shipments-dpkl-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

const DOCS = path.resolve(__dirname, '../docs');

// PR-112: 실제 파일(TYVN2026-21/22/27) 업로드 → 상세포장내역(DPKL)이 스타일별로 나뉜 여러
// ImportShipment에 source=EXCEL로 정확히 배분되는지 확인한다.
describe('DPKL 상세포장내역 자동 파싱 — 실제 파일 업로드 (PR-112)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `dpkl-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'DPKL E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const createStyle = (styleNo: string) =>
    request(app.getHttpServer())
      .post('/master-styles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        styleNo, factory: '베트남', buyer: 'DPKL E2E', totalQty: 100, brand: 'x',
        itemType: 'JK', productionType: 'FOB', targetRdd: '2026-12-01',
      })
      .expect(201);

  const upload = (file: string) =>
    request(app.getHttpServer())
      .post('/import-shipments/import-from-file')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fs.readFileSync(path.join(DOCS, file)), 'upload.xlsx')
      .expect(201);

  const detailsOf = async (shipmentId: number) =>
    (
      await request(app.getHttpServer())
        .get(`/import-shipments/${shipmentId}/packing-details`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body.data as any[];

  const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.qty), 0);

  it('TYVN2026-21(13개 스타일/5개 브랜드): 스타일마다 자기 shipment에만 상세내역이 들어가고 합계가 원본과 일치', async () => {
    const expected: Record<string, number> = {
      LB69SKM101Z: 184, LB69SLM101A: 186, LB69SLM104Z: 191, VB69SLM103Z: 296, LB69SLM102Z: 186,
      LB69SLM105Z: 102, MB6YHMP104Z: 1345, LB69BLM102Z: 275, SK0H3D01: 200, DR0G6D02: 323,
      DR0H6D01: 180, BF6821C52: 409, BF6821C54: 495,
    };
    for (const styleNo of Object.keys(expected)) await createStyle(styleNo);

    const res = await upload('TYVN2026-21(검토완료).xlsx');
    const shipments: any[] = res.body.data.shipments;
    expect(shipments).toHaveLength(13);

    let grand = 0;
    for (const shipment of shipments) {
      const details = await detailsOf(shipment.id);
      expect(details.every((d) => d.source === 'EXCEL')).toBe(true);
      expect(details.every((d) => d.styleNo === shipment.styleNo)).toBe(true);
      expect(sum(details)).toBe(expected[shipment.styleNo]);
      grand += sum(details);
    }
    expect(grand).toBe(4372);
  });

  it('TYVN2026-22(DETAIL PACKING): BF6821C13 합계 631', async () => {
    await createStyle('BF6821C13');
    const res = await upload('TYVN2026-22 검토완료.xlsx');
    const shipment = res.body.data.shipments.find((s: any) => s.styleNo === 'BF6821C13');
    const details = await detailsOf(shipment.id);
    expect(details).toHaveLength(6);
    expect(sum(details)).toBe(631);
    expect(details.every((d) => d.source === 'EXCEL')).toBe(true);
  });

  it('TYVN2026-27(품번별): BF6827C51 합계 808', async () => {
    await createStyle('BF6827C51');
    const res = await upload('TYVN2026-27(검토완료).xlsx');
    const shipment = res.body.data.shipments.find((s: any) => s.styleNo === 'BF6827C51');
    const details = await detailsOf(shipment.id);
    expect(details).toHaveLength(8);
    expect(sum(details)).toBe(808);
  });

  it('MANUAL 수기입력과 EXCEL은 서로 다른 shipment(업로드마다 새 문서)라 덮어쓰지 않고 공존한다', async () => {
    const first = (await upload('TYVN2026-22 검토완료.xlsx')).body.data.shipments[0];
    await request(app.getHttpServer())
      .post(`/import-shipments/${first.id}/packing-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ details: [{ color: 'HAND', size: 'F', qty: 7 }] })
      .expect(201);

    const second = (await upload('TYVN2026-22 검토완료.xlsx')).body.data.shipments[0];
    expect(second.id).not.toBe(first.id);

    const firstDetails = await detailsOf(first.id);
    expect(firstDetails.filter((d) => d.source === 'MANUAL')).toHaveLength(1);
    expect(firstDetails.filter((d) => d.source === 'EXCEL')).toHaveLength(6);
    expect((await detailsOf(second.id)).every((d) => d.source === 'EXCEL')).toBe(true);
  });
});
