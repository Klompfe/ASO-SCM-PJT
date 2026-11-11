import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-bulk-approve-colorof-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-236(사용자 보고): 자재 > 일괄 승인에서 "bomItems.13.colorOf must be a string"
// 오류로 한 스타일만 실패하던 문제 — 엑셀 파서가 비문자 색상 칸을 그대로 넘겼던
// 근본 원인(section-parser.util.ts)과 DTO 안전망(commit-mapping.dto.ts)을 실제
// POST /mapping/commit 호출로 끝까지 검증한다. 합성 자재명/스타일번호만 사용.
describe('일괄 승인 colorOf 타입 오류 — 엑셀 파서 수정 + DTO 안전망 + 한글 오류 문구 (PR-236)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();
  const post = (url: string) => auth(request(http()).post(url));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const email = `bulk-approve-colorof-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'Bulk Approve ColorOf E2E' });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('colorOf가 숫자(비문자)여도 이제는 저장이 성공한다(엑셀 파서를 거치지 않고 직접 API를 호출해도 DTO 안전망이 받아낸다)', async () => {
    const styleNo = `PR236-NUM-${tag}`;
    const res = await post('/mapping/commit').send({
      styleNo,
      overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR236 Buyer', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: `자재${tag}`, colorOf: 55, consumption: 1, requiredQty: 100 } as any],
    });
    expect(res.status).toBe(201);
    // colorOf 자체은 commit() 저장 로직이 읽지 않는 필드다(검증만 통과하면 그 이후
    // 저장에는 영향 없음) — 그래서 요청이 "성공"했다는 사실(201) 자체가 핵심 증거다.
    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    expect(bom).toHaveLength(1);
  });

  it('colorOf가 진짜 이상한 값(객체)이면 여전히 거부되지만, 한글로 행 번호와 함께 안내한다(영문 원문 노출 안 함)', async () => {
    const styleNo = `PR236-OBJ-${tag}`;
    const res = await post('/mapping/commit').send({
      styleNo,
      overviewData: { styleNo, factory: '베트남', totalQty: 100, buyer: 'PR236 Buyer', shipDate: '' },
      bomItems: [
        { category: '부자재', itemName: `정상자재${tag}`, colorOf: 'BK', consumption: 1, requiredQty: 100 },
        { category: '부자재', itemName: `문제자재${tag}`, colorOf: { weird: true } as any, consumption: 1, requiredQty: 100 },
      ],
    });
    expect(res.status).toBe(400);
    const messages: string[] = Array.isArray(res.body.message?.message) ? res.body.message.message : [];
    expect(messages.some((m) => m.includes('2번째 자재 행'))).toBe(true); // 인덱스 1 → 2번째(1부터).
    expect(messages.some((m) => m.includes("'색상'"))).toBe(true);
    expect(messages.some((m) => m.includes('must be a string'))).toBe(false); // 영문 원문 노출 안 함.
  });

  it('한 스타일이 실패해도 다른 스타일 저장에는 영향이 없고(독립적), 실패한 스타일은 아무것도 저장되지 않는다(전체 롤백)', async () => {
    const failStyleNo = `PR236-FAIL-${tag}`;
    const okStyleNo = `PR236-OK-${tag}`;

    const failRes = await post('/mapping/commit').send({
      styleNo: failStyleNo,
      overviewData: { styleNo: failStyleNo, factory: '베트남', totalQty: 100, buyer: 'PR236 Buyer', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: `실패자재${tag}`, colorOf: [1, 2] as any, consumption: 1, requiredQty: 100 }],
    });
    expect(failRes.status).toBe(400);

    const okRes = await post('/mapping/commit').send({
      styleNo: okStyleNo,
      overviewData: { styleNo: okStyleNo, factory: '베트남', totalQty: 100, buyer: 'PR236 Buyer', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: `성공자재${tag}`, colorOf: 'BK', consumption: 1, requiredQty: 100 }],
    });
    expect(okRes.status).toBe(201); // 실패 스타일과 무관하게 성공.

    const failStyleRows = await dataSource.query('SELECT * FROM master_style WHERE styleNo = ?', [failStyleNo]);
    expect(failStyleRows).toHaveLength(0); // 실패한 스타일은 아무것도 저장되지 않음(전체 롤백).

    const okStyleRows = await dataSource.query('SELECT * FROM master_style WHERE styleNo = ?', [okStyleNo]);
    expect(okStyleRows).toHaveLength(1);
  });

  it('styleNo 누락 같은 colorOf와 무관한 오류는 기존 방식(변경 없음)으로 그대로 내려간다', async () => {
    const res = await post('/mapping/commit').send({
      overviewData: { factory: '베트남', totalQty: 100, buyer: 'PR236 Buyer', shipDate: '' },
      bomItems: [{ category: '부자재', itemName: `자재${tag}`, consumption: 1, requiredQty: 100 }],
    });
    expect(res.status).toBe(400);
    const messages: string[] = Array.isArray(res.body.message?.message) ? res.body.message.message : [];
    expect(messages.some((m) => m.includes('styleNo'))).toBe(true); // 번역 패턴에 안 걸려 원문 그대로.
  });
});
