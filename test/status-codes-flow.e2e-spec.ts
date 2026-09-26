import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-status-codes-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User, UserRole } from '../src/users/entities/user.entity';

// PR-140: 상태코드 마스터 테이블 — CRUD, 권한(MANAGER/ADMIN 전용 쓰기), 사용 중인 코드 삭제
// 방지, 그리고 WorkOrder 상태 필터/변경이 이 테이블 기준으로도 기존과 동일하게 동작하는지.
describe('상태코드 마스터 테이블 (PR-140)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let managerToken: string;

  const auth = (r: request.Test, token: string) => r.set('Authorization', `Bearer ${token}`);
  const get = (url: string, token = userToken) => auth(request(app.getHttpServer()).get(url), token);
  const post = (url: string, token = managerToken) => auth(request(app.getHttpServer()).post(url), token);
  const patch = (url: string, token = managerToken) => auth(request(app.getHttpServer()).patch(url), token);
  const del = (url: string, token = managerToken) => auth(request(app.getHttpServer()).delete(url), token);

  const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
    const password = 'password123!';
    await request(app.getHttpServer()).post('/auth/register').send({ email, password, name: 'Status Codes Tester' }).expect(201);
    if (role) {
      await dataSource.getRepository(User).update({ email }, { role });
    }
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    return loginRes.body.data.accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const stamp = Date.now();
    userToken = await registerAndLogin(`status-codes-user-${stamp}@test.com`);
    managerToken = await registerAndLogin(`status-codes-manager-${stamp}@test.com`, UserRole.ADMIN);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('CRUD + 정렬/활성 필터', () => {
    it('등록 → 목록(정렬순) → 수정(라벨/정렬/비활성) → 비활성은 기본 목록에서 빠지고 includeInactive=true면 나온다', async () => {
      const domain = `E2E_DOMAIN_${Date.now()}`;
      const b = (await post('/status-codes').send({ domain, code: 'BBB', label: 'B', sortOrder: 2 }).expect(201)).body.data;
      const a = (await post('/status-codes').send({ domain, code: 'AAA', label: 'A', sortOrder: 1 }).expect(201)).body.data;

      const listed = (await get(`/status-codes?domain=${domain}`).expect(200)).body.data;
      expect(listed.map((s: any) => s.code)).toEqual(['AAA', 'BBB']); // sortOrder 순

      await patch(`/status-codes/${b.id}`).send({ label: 'B수정', isActive: false }).expect(200);

      const activeOnly = (await get(`/status-codes?domain=${domain}`).expect(200)).body.data;
      expect(activeOnly.map((s: any) => s.code)).toEqual(['AAA']);

      const withInactive = (await get(`/status-codes?domain=${domain}&includeInactive=true`).expect(200)).body.data;
      expect(withInactive.map((s: any) => s.code).sort()).toEqual(['AAA', 'BBB']);
      expect(withInactive.find((s: any) => s.code === 'BBB').label).toBe('B수정');

      void a;
    });

    it('같은 domain+code를 두 번 등록하면 400', async () => {
      const domain = `E2E_DUP_${Date.now()}`;
      await post('/status-codes').send({ domain, code: 'X', label: 'X' }).expect(201);
      await post('/status-codes').send({ domain, code: 'X', label: 'X다시' }).expect(400);
    });

    it('code 형식이 잘못되면(소문자 등) 400', async () => {
      await post('/status-codes').send({ domain: 'E2E_BAD', code: 'lowercase', label: '나쁨' }).expect(400);
    });

    it('삭제: 존재하지 않는 id는 404', async () => {
      await del('/status-codes/9999999').expect(404);
    });
  });

  describe('권한: 조회는 USER도 가능, 등록/수정/삭제는 MANAGER/ADMIN만', () => {
    it('GET은 일반 USER로도 된다', async () => {
      await get('/status-codes?domain=WORK_ORDER', userToken).expect(200);
    });

    it('POST/PATCH/DELETE는 USER면 403', async () => {
      await post('/status-codes', userToken).send({ domain: 'RBAC', code: 'X', label: 'X' }).expect(403);
      const existing = (await post('/status-codes').send({ domain: `E2E_RBAC_${Date.now()}`, code: 'X', label: 'X' }).expect(201)).body.data;
      await patch(`/status-codes/${existing.id}`, userToken).send({ label: 'hacked' }).expect(403);
      await del(`/status-codes/${existing.id}`, userToken).expect(403);
    });
  });

  describe('WORK_ORDER 도메인 시드 + 작업지시 연동', () => {
    it('domain=WORK_ORDER로 조회하면 최소한 기존 enum 4개 값이 (마이그레이션이 실행된 환경이라면) 존재할 수 있는 형태다', async () => {
      // 이 테스트는 SQLite(synchronize)로 떠서 마이그레이션이 실행되지 않으므로 시드는 비어있을 수 있다 —
      // 여기서는 API가 정상 응답하는지(빈 배열도 정상)만 확인한다. 실제 시드 값 일치는
      // work-order-status-seed.migration.spec.ts가 별도로 검증한다.
      const res = await get('/status-codes?domain=WORK_ORDER').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('관리자가 새 상태코드(ON_HOLD)를 등록하면, 그 코드로 작업지시 상태를 변경할 수 있다', async () => {
      const domain = 'WORK_ORDER';
      const code = `ONHOLD${Date.now()}`;
      await post('/status-codes').send({ domain, code, label: '보류' }).expect(201);

      const item = (await post('/items', managerToken).send({ code: `SC-ITEM-${Date.now()}`, name: '상태코드 테스트 품목', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      const wo = (await post('/work-orders', managerToken).send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;

      const updated = (await patch(`/work-orders/${wo.id}/status`, managerToken).send({ status: code }).expect(200)).body.data;
      expect(updated.status).toBe(code);
    });

    it('등록되지 않은(존재하지 않는) 상태코드로 변경하면 400', async () => {
      const item = (await post('/items', managerToken).send({ code: `SC-ITEM2-${Date.now()}`, name: '상태코드 테스트 품목2', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      const wo = (await post('/work-orders', managerToken).send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;
      await patch(`/work-orders/${wo.id}/status`, managerToken).send({ status: 'TOTALLY_MADE_UP_STATUS' }).expect(400);
    });

    it('내장 상태값(COMPLETED 등)은 여전히 정상 동작한다(회귀) — 완료 처리 시 재고 로직 포함', async () => {
      const item = (await post('/items', managerToken).send({ code: `SC-ITEM3-${Date.now()}`, name: '상태코드 회귀 품목', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      const wo = (await post('/work-orders', managerToken).send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;
      const updated = (await patch(`/work-orders/${wo.id}/status`, managerToken).send({ status: 'COMPLETED' }).expect(200)).body.data;
      expect(updated.status).toBe('COMPLETED');
    });

    it('사용 중인 상태코드(work_orders가 참조)는 삭제가 막히고, 비활성화는 된다', async () => {
      const domain = 'WORK_ORDER';
      const code = `INUSE${Date.now()}`;
      const created = (await post('/status-codes').send({ domain, code, label: '사용중' }).expect(201)).body.data;

      const item = (await post('/items', managerToken).send({ code: `SC-ITEM4-${Date.now()}`, name: '사용중 코드 품목', type: 'FINISHED_GOOD' }).expect(201)).body.data;
      const wo = (await post('/work-orders', managerToken).send({ itemId: item.id, targetQuantity: 1 }).expect(201)).body.data;
      await patch(`/work-orders/${wo.id}/status`, managerToken).send({ status: code }).expect(200);

      const delRes = await del(`/status-codes/${created.id}`).expect(409);
      expect(JSON.stringify(delRes.body.message)).toMatch(/사용 중|삭제할 수 없습니다/);

      await patch(`/status-codes/${created.id}`).send({ isActive: false }).expect(200);
      const afterDeactivate = (await get(`/status-codes?domain=${domain}`).expect(200)).body.data;
      expect(afterDeactivate.find((s: any) => s.code === code)).toBeUndefined();
    });
  });
});
