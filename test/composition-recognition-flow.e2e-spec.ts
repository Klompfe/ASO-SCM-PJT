import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-composition-recognition-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { VisionService } from '../src/sales-orders/vision.service';
import { SalesOrdersService } from '../src/sales-orders/sales-orders.service';

// PR-247: 인식(모의 Gemini 응답) → upload-image 후처리 → commit-analysis → 저장. 실제 Gemini 호출 없음
// (VisionService 의 genAI 를 스텁으로 교체). 합성 값만 사용. PR-246 규칙(기존 값이 있으면 유지)도 함께 확인.
// 1x1 투명 PNG(합성) — 업로드 파일 형식 검사(매직 넘버)를 통과시키기 위한 최소 유효 PNG.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('작지 인식 혼용률 → 저장 (PR-247)', () => {
  let app: INestApplication;
  let token: string;
  const stamp = Date.now();
  const styleNo = `COMPOREC-${stamp}`;
  const shellName = `SHELL_A_${stamp}`;
  const liningName = `LINING_A_${stamp}`;
  let recognizedComposition: unknown = 'c/p=60/40';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const vision = app.get(VisionService) as any;
    const generateContent = jest.fn().mockImplementation(async () => ({
      response: {
        candidates: [{ finishReason: 'STOP' }],
        text: () =>
          JSON.stringify([
            {
              overview: { styleNo, styleName: null, itemType: null, brand: null, productionType: null, factory: '베트남', buyer: 'Composition Rec E2E', totalQty: 100, targetRdd: null, documentDate: null },
              bomItems: [
                { category: '겉감', itemName: shellName, spec: 'FABRIC', colorCode: 'BK', consumption: 1, requiredQty: 100, supplier: null, remarks: null, composition: recognizedComposition },
                { category: '안감', itemName: liningName, spec: 'FABRIC', colorCode: 'BK', consumption: 1, requiredQty: 100, supplier: null, remarks: null, composition: null },
              ],
              sizeSpecs: [],
              workNotes: null,
            },
          ]),
        usageMetadata: { promptTokenCount: 100, totalTokenCount: 300 },
      },
    }));
    vision.genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };

    const email = `composition-rec-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Composition Rec E2E' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 인식 단계는 서비스 메서드(analyzeImage: 가드레일 컨텍스트 + VisionService 후처리)를 직접 호출한다 —
  // HTTP 업로드 라우트의 FileTypeValidator 가 jest 환경에서 동적 import(file-type)를 못 써서 400 이 되기
  // 때문이다(라우트 자체는 sales-orders-routes-flow 가 확인). 사용자 1은 이 임시 DB 에서 가장 먼저 가입한 계정이다.
  const recognize = async () => {
    const file = { buffer: TINY_PNG, mimetype: 'image/png', originalname: 'sheet.png' } as any;
    const out = await app.get(SalesOrdersService).analyzeImage(file, 1);
    // HTTP 응답과 같은 형태(JSON 직렬화)로 맞춘다.
    return JSON.parse(JSON.stringify(out.results[0]));
  };
  const commit = (result: unknown) =>
    request(app.getHttpServer()).post('/sales-orders/commit-analysis').set('Authorization', `Bearer ${token}`).send(result as object);
  const items = async () =>
    (await request(app.getHttpServer()).get('/boms').query({ styleNo }).set('Authorization', `Bearer ${token}`).expect(200)).body.data.items as any[];
  const byName = async (name: string) => (await items()).find((i) => i.material?.name === name);

  it('인식 응답의 혼용률이 후처리를 거쳐 글자 그대로 저장 화면 결과에 담기고, 그대로 저장된다(안감은 인식값이 없어 기존 기본값)', async () => {
    const result = await recognize();
    expect(result.bomItems[0].composition).toBe('c/p=60/40'); // 약어·소문자 그대로
    expect(result.bomItems[1].composition).toBeNull();
    await commit(result).expect(201);
    expect((await byName(shellName)).composition).toBe('c/p=60/40');
    expect((await byName(liningName)).composition).toBe('POLYESTER 100%'); // PR-100 기존 기본값 규칙
  });

  it('다른 값이 다시 인식돼도 저장된 값은 유지된다(PR-246 규칙) — 덮어쓰기 표시가 있을 때만 교체', async () => {
    recognizedComposition = 'Cotton 100%';
    const result = await recognize();
    expect(result.bomItems[0].composition).toBe('Cotton 100%');
    await commit(result).expect(201);
    expect((await byName(shellName)).composition).toBe('c/p=60/40');
    await commit({ ...result, decisions: { incoming: [{ index: 0, action: 'update', overwriteComposition: true }] } }).expect(201);
    expect((await byName(shellName)).composition).toBe('Cotton 100%');
  });

  it('자리표시자("N/A")나 비문자열이 인식돼도 null 로 정리되어 기존 값을 지우지 않는다', async () => {
    for (const value of ['N/A', 60]) {
      recognizedComposition = value;
      const result = await recognize();
      expect(result.bomItems[0].composition).toBeNull();
      await commit(result).expect(201);
    }
    expect((await byName(shellName)).composition).toBe('Cotton 100%');
  });
});
