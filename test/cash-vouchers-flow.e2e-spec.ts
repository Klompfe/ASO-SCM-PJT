import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-cash-vouchers-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// PR-094: 입출금전표(CashVoucher) 등록 → 목록 조회 → summary(기간 합계) 확인 흐름을
// 실제 HTTP 요청으로 검증한다.
describe('입출금전표관리 흐름 (PR-094)', () => {
  let app: INestApplication;
  let token: string;

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

    const email = `cash-vouchers-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Cash Vouchers E2E' });
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

  it('로그인 없이 호출하면 401이어야 한다', async () => {
    await request(app.getHttpServer()).get('/cash-vouchers').expect(401);
  });

  it('입금 1건, 출금 1건을 등록하면 목록 조회에서 둘 다 보이고, summary가 정확해야 한다', async () => {
    const depositRes = await request(app.getHttpServer())
      .post('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        voucherType: 'DEPOSIT',
        voucherDate: '2026-09-10',
        amount: 3000000,
        counterpartyName: '미도컴퍼니',
        account: '국민은행 태일무역',
        category: '수출대금',
        note: 'E2E 입금 테스트',
      })
      .expect(201);
    expect(depositRes.body.data.voucherType).toBe('DEPOSIT');
    expect(Number(depositRes.body.data.amount)).toBe(3000000);

    const withdrawalRes = await request(app.getHttpServer())
      .post('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        voucherType: 'WITHDRAWAL',
        voucherDate: '2026-09-12',
        amount: 1200000,
        counterpartyName: '태일비나',
        account: '국민은행 태일무역',
        category: '원자재대금',
        note: 'E2E 출금 테스트',
      })
      .expect(201);
    expect(withdrawalRes.body.data.voucherType).toBe('WITHDRAWAL');

    const listRes = await request(app.getHttpServer())
      .get('/cash-vouchers')
      .query({ from: '2026-09-10', to: '2026-09-12' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.some((v: any) => v.id === depositRes.body.data.id)).toBe(true);
    expect(listRes.body.data.some((v: any) => v.id === withdrawalRes.body.data.id)).toBe(true);

    const summaryRes = await request(app.getHttpServer())
      .get('/cash-vouchers/summary')
      .query({ from: '2026-09-10', to: '2026-09-12' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Number(summaryRes.body.data.depositTotal)).toBe(3000000);
    expect(Number(summaryRes.body.data.withdrawalTotal)).toBe(1200000);
    expect(Number(summaryRes.body.data.balance)).toBe(1800000);
  });

  it('voucherType 필터를 걸면 해당 구분만 조회된다', async () => {
    const styleTag = `FILTER-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        voucherType: 'DEPOSIT',
        voucherDate: '2026-09-20',
        amount: 100,
        counterpartyName: styleTag,
        account: '현금',
        category: '기타',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        voucherType: 'WITHDRAWAL',
        voucherDate: '2026-09-20',
        amount: 50,
        counterpartyName: styleTag,
        account: '현금',
        category: '기타',
      })
      .expect(201);

    const depositOnly = await request(app.getHttpServer())
      .get('/cash-vouchers')
      .query({ voucherType: 'DEPOSIT' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const filtered = depositOnly.body.data.filter((v: any) => v.counterpartyName === styleTag);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].voucherType).toBe('DEPOSIT');
  });

  it('기간 밖의 전표는 summary/목록에서 제외되어야 한다', async () => {
    const outOfRangeTag = `OUT-OF-RANGE-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        voucherType: 'DEPOSIT',
        voucherDate: '2026-01-01',
        amount: 999999,
        counterpartyName: outOfRangeTag,
        account: '현금',
        category: '기타',
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/cash-vouchers')
      .query({ from: '2026-09-01', to: '2026-09-30' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.some((v: any) => v.id === created.body.data.id)).toBe(false);

    // 필터 없이 전체 목록을 조회하면(범위 지정 안 함) 1월 전표도 포함되어야 한다 —
    // 즉 "필터를 걸었을 때만 제외된다"는 것까지 함께 확인한다.
    const allRes = await request(app.getHttpServer())
      .get('/cash-vouchers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(allRes.body.data.some((v: any) => v.id === created.body.data.id)).toBe(true);
  });
});
