import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-composition-excel-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as xlsx from 'xlsx';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-248: MATERIAL LIST 엑셀(합성 xlsx, 실제 파일 없음) → /mapping/parse → commit / bom-diff·reconcile.
// 혼용률은 적힌 그대로 저장되고, 기존 행은 PR-246 규칙(비어 있음→채움 / 같음→불변 / 다름→유지 / 빈 값 보존)을 따른다.
describe('MATERIAL LIST 엑셀 혼용률 (PR-248)', () => {
  let app: INestApplication;
  let token: string;
  const stamp = Date.now();
  const STYLE = `COMPOXL-${stamp}`;
  const shell = `SHELL_A_${stamp}`;
  const lining = `LINING_A_${stamp}`;
  const trim = `TRIM_A_${stamp}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    const email = `composition-xl-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Composition XL' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const post = (url: string) => auth(request(app.getHttpServer()).post(url));

  // 합성 시트: 헤더 행(index 13)에 "혼용률\n중량" 열(26번째)이 있다.
  function buildXlsx(rows: { category: string; name: string; consumption: number; composition?: string | number | null }[], withColumn = true): Buffer {
    const blank = () => Array.from({ length: 30 }, () => '' as string | number);
    const aoa: (string | number)[][] = Array.from({ length: 13 }, blank);
    aoa[1][1] = STYLE;
    aoa[1][8] = 100;
    aoa[1][14] = '베트남';
    aoa[1][21] = '테스트바이어';
    const header = blank();
    header[0] = 'ITEMS'; header[1] = 'QTY'; header[2] = 'COLOR OF'; header[10] = "CON'S";
    if (withColumn) header[26] = '혼용률\n중량';
    aoa.push(header, blank());
    for (const r of rows) {
      const row = blank();
      row[0] = r.name;
      row[2] = 'BK';
      row[8] = r.category; // 규격 칸 — 구분 대신 규격으로 구분(이 합성 시트의 category 는 row[0] = 자재명)
      row[10] = r.consumption;
      if (withColumn && r.composition != null) row[26] = r.composition;
      aoa.push(row);
    }
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(aoa), 'S1');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  const parse = async (buffer: Buffer) => {
    const res = await auth(request(app.getHttpServer()).post('/mapping/parse')).attach('file', buffer, 'synthetic.xlsx').expect(201);
    return res.body.data[0] as { overview: any; bomItems: any[]; warnings?: string[] };
  };
  const commitSheet = (sheet: { overview: any; bomItems: any[] }) =>
    post('/mapping/commit').send({ styleNo: STYLE, overviewData: sheet.overview, bomItems: sheet.bomItems });
  const items = async () => (await auth(request(app.getHttpServer()).get('/boms').query({ styleNo: STYLE })).expect(200)).body.data.items as any[];
  const byName = async (name: string) => (await items()).find((i) => i.material?.name === name.toUpperCase());

  it('파서: 혼용률 열 값이 그대로 읽히고(약어·소문자 포함) 빈 칸은 필드가 없다', async () => {
    const sheet = await parse(buildXlsx([
      { category: 'S', name: shell, consumption: 1, composition: 'c/p=60/40' },
      { category: 'S', name: lining, consumption: 1 },
      { category: 'S', name: trim, consumption: 1, composition: 'N/A' },
    ]));
    const byItem = (n: string) => sheet.bomItems.find((i) => i.itemName === n.toUpperCase());
    expect(byItem(shell).composition).toBe('c/p=60/40');
    expect('composition' in byItem(lining)).toBe(false);
    expect('composition' in byItem(trim)).toBe(false);
  });

  it('처음 승인(commit): 읽은 혼용률이 그대로 저장된다', async () => {
    const sheet = await parse(buildXlsx([
      { category: 'S', name: shell, consumption: 1, composition: 'c/p=60/40' },
      { category: 'S', name: lining, consumption: 1 },
    ]));
    await commitSheet(sheet).expect(201);
    expect((await byName(shell)).composition).toBe('c/p=60/40');
    const lin = await byName(lining);
    expect(lin.composition ?? null).toBeNull();
  });

  it('재승인(commit, 기존 행): 같음→불변, 다름→유지, 엑셀 빈 값→기존 값 보존, 비어 있던 행→채움', async () => {
    const sheet = await parse(buildXlsx([
      { category: 'S', name: shell, consumption: 1, composition: 'Cotton 100%' }, // 다름 → 유지
      { category: 'S', name: lining, consumption: 1, composition: 'POLYESTER 100%' }, // 비어 있음 → 채움
    ]));
    await commitSheet(sheet).expect(201);
    expect((await byName(shell)).composition).toBe('c/p=60/40');
    expect((await byName(lining)).composition).toBe('POLYESTER 100%');

    const emptySheet = await parse(buildXlsx([{ category: 'S', name: shell, consumption: 1 }, { category: 'S', name: lining, consumption: 1, composition: '-' }]));
    await commitSheet(emptySheet).expect(201);
    expect((await byName(shell)).composition).toBe('c/p=60/40');
    expect((await byName(lining)).composition).toBe('POLYESTER 100%');

    const same = await parse(buildXlsx([{ category: 'S', name: shell, consumption: 1, composition: 'c/p=60/40' }]));
    await commitSheet(same).expect(201);
    expect((await byName(shell)).composition).toBe('c/p=60/40');
  });

  it('bom-diff/reconcile 경로: 엑셀 혼용률이 응답에 실리고, OVERWRITE 는 요척만 바꾸며 혼용률은 조용히 바꾸지 않고, ADD 는 새 행에 저장한다', async () => {
    const diff = (await post('/mapping/bom-diff').send({
      styleNo: STYLE,
      bomItems: [
        { category: shell, itemName: shell, colorCode: 'BK', spec: 'S', consumption: 2, composition: 'Cotton 100%' },
        { category: trim, itemName: trim, colorCode: 'BK', spec: 'S', consumption: 1, composition: 'ZINC 100%' },
      ],
    }).expect(201)).body.data;
    const incomingWithComposition = (diff.rows as any[]).map((r) => r.incoming).filter(Boolean);
    expect(incomingWithComposition.some((r) => r.composition === 'ZINC 100%')).toBe(true);

    const existing = await byName(shell);
    const res = await post('/mapping/bom-reconcile').send({
      styleNo: STYLE,
      actions: [
        { type: 'OVERWRITE', bomItemId: existing.id, newItem: { itemName: shell, category: existing.category, consumption: 2, composition: 'Cotton 100%' } },
        { type: 'ADD', newItem: { itemName: trim, category: '부자재', colorCode: 'BK', spec: 'S', consumption: 1, composition: 'ZINC 100%' } },
      ],
    }).expect(201);
    expect(res.body.data.warnings.some((w: string) => w.includes('혼용률이 기존 값과 달라 기존 값을 유지'))).toBe(true);
    expect(Number((await byName(shell)).consumption)).toBe(2);
    expect((await byName(shell)).composition).toBe('c/p=60/40'); // 유지
    expect((await byName(trim)).composition).toBe('ZINC 100%'); // ADD 저장

    // 엑셀 값이 비어 있는 OVERWRITE 는 기존 값을 지우지 않는다(필드 없음).
    await post('/mapping/bom-reconcile').send({
      styleNo: STYLE,
      actions: [{ type: 'OVERWRITE', bomItemId: existing.id, newItem: { itemName: shell, category: existing.category, consumption: 3 } }],
    }).expect(201);
    expect((await byName(shell)).composition).toBe('c/p=60/40');
  });

  it('검증: 혼용률 500자 초과는 commit/reconcile 에서 400', async () => {
    await post('/mapping/commit').send({
      styleNo: STYLE,
      overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 100, buyer: 'B' },
      bomItems: [{ itemName: shell, composition: 'A'.repeat(501) }],
    }).expect(400);
  });
});
