import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-material-list-header-reupload-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Bom } from '../src/boms/entities/bom.entity';
import { SectionParser } from '../src/mapping/utils/section-parser.util';

// PR-254: 머리글(ITEMS) 줄을 찾아 읽도록 고친 파서로, 겉감 행 없이 등록돼 있던 스타일을 다시 올리는 흐름.
// 새 겉감 행은 "신규 행"(ONLY_NEW)으로 비교에 나타나고, 저장하면 추가되며 기존 행·값은 그대로여야 한다(삭제 없음).
// 합성 시트(실제 업무 데이터·파일 없음)는 이 테스트 코드 안에서 만든다.
const STYLE = 'HDR-STYLE-1';

function syntheticSheet(): string[][] {
  const blank = () => Array.from({ length: 30 }, () => '') as unknown[];
  const rows: unknown[][] = Array.from({ length: 20 }, blank);
  rows[1][1] = STYLE; rows[1][8] = '100'; rows[1][14] = '베트남'; rows[1][21] = '테스트바이어';
  rows[12][0] = 'ITEMS'; rows[12][2] = 'COLOR OF'; rows[12][26] = '혼용률\n중량';
  rows[13][2] = 'OUT SHELL'; rows[13][8] = 'SPEC'; rows[13][10] = "CON'S";
  const data = [
    ['겉감\nOUT-SHELL', 'COTTON 60% POLYESTER 40%'],
    ['안감 LINING', 'POLYESTER 100%'],
    ['EDGE TAPE', ''],
  ];
  data.forEach(([name, comp], i) => {
    const r = rows[14 + i];
    r[0] = name; r[2] = 'BK'; r[8] = 'S'; r[10] = '1'; r[26] = comp;
  });
  return rows as string[][];
}

describe('겉감 행 없이 등록된 스타일 재업로드 (PR-254)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const post = (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `hdr-reupload-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Hdr Reupload' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const items = async () => (await dataSource.getRepository(Bom).findOneOrFail({ where: { style: { styleNo: STYLE } }, relations: ['items', 'items.material'] })).items;
  const quiet = () => jest.spyOn(console, 'log').mockImplementation(() => undefined);

  it('고친 파서는 겉감 행을 읽고, 겉감 없이 등록된 기존 BOM 에는 신규 행으로만 나타나며 저장해도 기존 행은 보존된다', async () => {
    const spy = quiet();
    const parsed = SectionParser.parse(syntheticSheet(), []);
    spy.mockRestore();
    expect(parsed.bomItems).toHaveLength(3);
    const shellIdx = parsed.bomItems.findIndex((b: any) => b.itemName.includes('OUT-SHELL'));
    expect(shellIdx).toBe(0);
    const toDto = (b: any) => ({ category: b.category, itemName: b.itemName, colorCode: b.colorOf, spec: b.spec, consumption: b.consumption, requiredQty: b.requiredQty, ...(b.composition ? { composition: b.composition } : {}) });
    const legacy = parsed.bomItems.slice(1).map(toDto); // 예전 파서 결과: 겉감 행 없음

    await post('/mapping/commit').send({ styleNo: STYLE, overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 100, buyer: '바이어A' }, bomItems: legacy }).expect(201);
    expect(await items()).toHaveLength(2);
    const before = (await items()).map((i) => `${i.material.name}|${i.composition ?? ''}|${Number(i.consumption)}`).sort();

    const diff = (await post('/mapping/bom-diff').send({ styleNo: STYLE, bomItems: parsed.bomItems.map(toDto) }).expect(201)).body.data;
    expect(diff.hasExistingBom).toBe(true);
    const onlyNew = diff.rows.filter((r: any) => r.type === 'ONLY_NEW');
    expect(onlyNew).toHaveLength(1);
    expect(onlyNew[0].incoming.itemName).toContain('OUT-SHELL');
    expect(diff.rows.some((r: any) => r.type === 'ONLY_EXISTING')).toBe(false);
    expect(await items()).toHaveLength(2); // 비교는 저장하지 않는다

    const res = (await post('/mapping/commit').send({ styleNo: STYLE, overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 100, buyer: '바이어A' }, bomItems: parsed.bomItems.map(toDto) }).expect(201)).body.data;
    expect(res.success).toBe(true);
    const after = await items();
    expect(after).toHaveLength(3);
    const shell = after.find((i) => i.material.name.includes('OUT-SHELL'))!;
    expect(shell.composition).toBe('COTTON 60% POLYESTER 40%');
    // 기존 두 행은 값 그대로(삭제·변경 없음)
    const beforeRows = after.filter((i) => !i.material.name.includes('OUT-SHELL')).map((i) => `${i.material.name}|${i.composition ?? ''}|${Number(i.consumption)}`).sort();
    expect(beforeRows).toEqual(before);
  });
});
