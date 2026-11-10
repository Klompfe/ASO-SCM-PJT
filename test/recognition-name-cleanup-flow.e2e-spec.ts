import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-recognition-name-cleanup-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-234(사용자 확인 사례): 작지 인식 결과의 자재명에서 영문 표기/작업 위치를 분리하는
// 서버측 정제(vision-guardrails.util.ts cleanupRecognizedMaterialName)가 적용된 뒤의
// 자재명으로 POST /mapping/commit을 호출하는 경로를 검증한다 — 정제는 vision.service.ts
// 쪉에서 일어나므로(Gemini 호출 없이, 이 테스트는 그 "정제 이후" 결과를 그대로 재현),
// 같은 정제된 이름으로 재저장해도 Item/BomItem이 늘지 않고 영문명이 보존되는지 확인한다.
// 합성 자재명/스타일번호만 사용(실제 업무 데이터 아님), sqlite 테스트 DB만 사용.
describe('작지 인식 자재명 정제 이후 commit() 재저장 회귀 테스트 (PR-234)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const email = `recognition-name-cleanup-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Recognition Name Cleanup E2E' });
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

  const commit = (payload: object) =>
    request(app.getHttpServer())
      .post('/mapping/commit')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(payload)
      .expect(201);

  it('정제된 이름으로 재저장해도 Item/BomItem이 늘지 않고, 신규 Item은 영문명을 받는다', async () => {
    const styleNo = `E2E-NAMECLEAN-${Date.now()}`;
    const cleanedName = `PR234테이프${Date.now()}(면)`; // cleanupRecognizedMaterialName이 돌려줄 법한 "정제된" 이름.

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: cleanedName, consumption: 1, requiredQty: 100, englishName: 'EDGE TAPE' }],
    });
    // 재저장(같은 정제된 이름, 다른 영문명 값) — 기존 영문명을 덮어쓰지 않아야 한다.
    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: cleanedName, consumption: 1, requiredQty: 100, englishName: 'EDGE TAPE(다른값)' }],
    });

    const items = await dataSource.query('SELECT * FROM items WHERE name = ?', [cleanedName]);
    expect(items).toHaveLength(1); // Item 중복 생성 없음.
    expect(items[0].englishName).toBe('EDGE TAPE'); // 처음 값 그대로 — 덮어쓰지 않음.

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(1); // BomItem 중복 생성 없음, requiredQty 두 배 아님.
    expect(Number(bomItems[0].requiredQty)).toBe(100);
  });

  it('위치 정보는 remarks(비고)로 저장된다(별도 컬럼 없음, 마이그레이션 없음)', async () => {
    const styleNo = `E2E-NAMECLEAN-LOC-${Date.now()}`;
    const name = `PR234위치${Date.now()}`;

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: name, consumption: 1, requiredQty: 100, remarks: '위치: 오비.주머니입구' }],
    });

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems[0].remarks).toBe('위치: 오비.주머니입구');
  });
});
