import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-material-packaging-unit-rules-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MaterialPackagingUnitRulesService } from '../src/material-packaging-unit-rules/material-packaging-unit-rules.service';
import { calculateConePriceUsd } from '../src/boms/utils/thread-cone-price.util';

// PR-175: 자재 포장단위 룩업(DB) — CRUD, 중복 방지, 실/테이프(50m/롤) 환산, BOM 테이프 종류 저장.
// sqlite e2e는 synchronize로 스키마를 만들므로 마이그레이션의 시드 행은 없다 — 여기서는
// 시드와 같은 값을 직접 등록해 룩업 동작을 검증한다(시드 자체 값은 마이그레이션 파일에서 확인).
describe('자재 포장단위 룩업 + 테이프 종류 회귀 테스트 (PR-175)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const email = `pkg-unit-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Packaging Unit E2E' });
    token = (
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

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  describe('규칙 CRUD', () => {
    it('등록 → 목록 조회 → 수정 → 삭제가 동작한다', async () => {
      const created = await auth(request(app.getHttpServer()).post('/material-packaging-unit-rules'))
        .send({ materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 })
        .expect(201);
      const id = created.body.data.id;

      const list = await auth(request(app.getHttpServer()).get('/material-packaging-unit-rules')).expect(200);
      expect(list.body.data.find((r: any) => r.id === id)).toBeDefined();

      const updated = await auth(request(app.getHttpServer()).patch(`/material-packaging-unit-rules/${id}`))
        .send({ unitLengthM: 2600 })
        .expect(200);
      expect(Number(updated.body.data.unitLengthM)).toBe(2600);

      await auth(request(app.getHttpServer()).delete(`/material-packaging-unit-rules/${id}`)).expect(200);
    });

    it('같은 materialSubType을 두 번 등록하면 400이어야 한다', async () => {
      await auth(request(app.getHttpServer()).post('/material-packaging-unit-rules'))
        .send({ materialSubType: 'DUP_TEST', displayName: '중복A', packagingUnitLabel: '롤', unitLengthM: 50 })
        .expect(201);
      await auth(request(app.getHttpServer()).post('/material-packaging-unit-rules'))
        .send({ materialSubType: 'DUP_TEST', displayName: '중복B', packagingUnitLabel: '롤', unitLengthM: 50 })
        .expect(400);
    });
  });

  describe('DB 룩업 → 콘가격 환산 (하드코딩 상수 대체 회귀)', () => {
    beforeAll(async () => {
      for (const row of [
        { materialSubType: 'LOOKUP_THREAD', displayName: '실테스트', packagingUnitLabel: '콘', unitLengthM: 2500 },
        { materialSubType: 'LOOKUP_DADE', displayName: '다데테스트', packagingUnitLabel: '롤', unitLengthM: 50 },
      ]) {
        await auth(request(app.getHttpServer()).post('/material-packaging-unit-rules')).send(row).expect(201);
      }
    });

    it('룩업 맵을 통한 실 환산이 기존 하드코딩 결과와 같다(미터 $0.00012 × 2500M = $0.30)', async () => {
      const service = app.get(MaterialPackagingUnitRulesService);
      const map = await service.findAllAsLengthMap();
      expect(calculateConePriceUsd(0.00012, 'LOOKUP_THREAD', map)).toBeCloseTo(0.3, 10);
    });

    it('테이프 50m/롤 환산이 룩업 맵을 통해 정확히 계산된다($0.0008 × 50M = $0.04)', async () => {
      const service = app.get(MaterialPackagingUnitRulesService);
      const map = await service.findAllAsLengthMap();
      expect(calculateConePriceUsd(0.0008, 'LOOKUP_DADE', map)).toBeCloseTo(0.04, 10);
    });
  });

  describe('BOM 테이프 종류 저장 (PATCH /boms/items/:id)', () => {
    it('tapeType을 보내면 BomItem.tapeType에 저장되고, 보내지 않으면 기존 값이 유지된다', async () => {
      // BOM 항목은 작업지시서 commit으로 만든다 — sales-orders commit-analysis 경로를 재사용.
      const styleNo = `PKG-TAPE-${Date.now()}`;
      await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send({
        overview: {
          styleNo, styleName: null, itemType: null, brand: null, productionType: null,
          factory: '베트남', buyer: '테스트', totalQty: 100, targetRdd: null, documentDate: null,
          targetRddSuspicious: false, handwrittenCmtPriceCandidate: null, cmtPrice: null,
        },
        bomItems: [
          { category: '부자재', itemName: '다데 테이프', spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null,
            materialSubTypeCandidate: '다데', threadType: null, tapeType: 'DADE' },
        ],
        sizeSpecs: [],
        workNotes: null,
      }).expect(201);

      const bomRes = await auth(request(app.getHttpServer()).get('/boms').query({ styleNo })).expect(200);
      const item = bomRes.body.data.items[0];
      expect(item.tapeType).toBe('DADE');
      expect(item.threadType ?? null).toBeNull();

      await auth(request(app.getHttpServer()).patch(`/boms/items/${item.id}`)).send({ composition: 'POLYESTER 100%' }).expect(200);
      const after = await auth(request(app.getHttpServer()).get('/boms').query({ styleNo })).expect(200);
      expect(after.body.data.items[0].tapeType).toBe('DADE'); // 다른 필드만 바꿔도 tapeType은 유지
    });
  });

  describe('AI 후보 안전모드 — 후보만으로는 저장되지 않는다', () => {
    it('commit 요청에 threadType/tapeType 없이 materialSubTypeCandidate만 보내면 BomItem의 실/테이프 종류는 비어 있다', async () => {
      const styleNo = `PKG-CAND-${Date.now()}`;
      await auth(request(app.getHttpServer()).post('/sales-orders/commit-analysis')).send({
        overview: {
          styleNo, styleName: null, itemType: null, brand: null, productionType: null,
          factory: '베트남', buyer: '테스트', totalQty: 100, targetRdd: null, documentDate: null,
          targetRddSuspicious: false, handwrittenCmtPriceCandidate: null, cmtPrice: null,
        },
        bomItems: [
          { category: '부자재', itemName: '코아사 실', spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null,
            materialSubTypeCandidate: '코아사' },
        ],
        sizeSpecs: [],
        workNotes: null,
      }).expect(201);

      const bomRes = await auth(request(app.getHttpServer()).get('/boms').query({ styleNo })).expect(200);
      const item = bomRes.body.data.items[0];
      expect(item.threadType ?? null).toBeNull();
      expect(item.tapeType ?? null).toBeNull();
    });
  });
});
