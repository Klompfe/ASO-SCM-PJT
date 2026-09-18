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

  // PR-108: 거래내역서 발급 — 특정 거래처(Buyer)로 필터링했을 때 다른 거래처
  // 전표가 섞이지 않는지, 기간 필터와 조합해도 정확한지 확인한다.
  describe('거래처 필터 — 거래내역서 발급 (PR-108)', () => {
    let buyerAId: number;
    let buyerBId: number;
    const ts = Date.now();

    it('사전 준비: 고객사 2곳을 만들고 각각 전표를 등록한다', async () => {
      const buyerA = await request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `거래내역서 테스트 A ${ts}` })
        .expect(201);
      buyerAId = buyerA.body.data.id;

      const buyerB = await request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `거래내역서 테스트 B ${ts}` })
        .expect(201);
      buyerBId = buyerB.body.data.id;

      // A: 입금 2건(2026-09-05, 2026-09-10), B: 입금 1건(2026-09-07) — 기간/거래처
      // 조합으로 A만, 기간까지 좁혔을 때 A의 일부만 나오는지 확인할 수 있게 구성.
      await request(app.getHttpServer())
        .post('/cash-vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({ voucherType: 'DEPOSIT', voucherDate: '2026-09-05', amount: 1000000, counterpartyName: 'A거래처', counterpartyBuyerId: buyerAId, account: '현금', category: '기타' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/cash-vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({ voucherType: 'WITHDRAWAL', voucherDate: '2026-09-10', amount: 300000, counterpartyName: 'A거래처', counterpartyBuyerId: buyerAId, account: '현금', category: '기타' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/cash-vouchers')
        .set('Authorization', `Bearer ${token}`)
        .send({ voucherType: 'DEPOSIT', voucherDate: '2026-09-07', amount: 500000, counterpartyName: 'B거래처', counterpartyBuyerId: buyerBId, account: '현금', category: '기타' })
        .expect(201);
    });

    it('buyerId로 필터하면 그 거래처 전표만 반환되고 다른 거래처 전표는 섞이지 않는다', async () => {
      const res = await request(app.getHttpServer())
        .get('/cash-vouchers')
        .query({ buyerId: buyerAId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((v: any) => v.counterpartyBuyerId === buyerAId)).toBe(true);
    });

    it('buyerId + summary는 그 거래처만의 입금/출금/잔액을 정확히 계산한다', async () => {
      const res = await request(app.getHttpServer())
        .get('/cash-vouchers/summary')
        .query({ buyerId: buyerAId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Number(res.body.data.depositTotal)).toBe(1000000);
      expect(Number(res.body.data.withdrawalTotal)).toBe(300000);
      expect(Number(res.body.data.balance)).toBe(700000);
    });

    it('buyerId + 기간 필터를 조합하면 그 기간 안의 해당 거래처 전표만 반환된다', async () => {
      const res = await request(app.getHttpServer())
        .get('/cash-vouchers')
        .query({ buyerId: buyerAId, from: '2026-09-01', to: '2026-09-06' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(Number(res.body.data[0].amount)).toBe(1000000);
    });
  });
});
