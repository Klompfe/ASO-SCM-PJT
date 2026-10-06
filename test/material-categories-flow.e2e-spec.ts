import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-material-categories-flow.sqlite');
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
import { MaterialCategory } from '../src/material-categories/entities/material-category.entity';

// PR-183: 품목군(material_categories) — CRUD, 사용 중 삭제 거절, 공급업체 categoryIds/필터/응답,
// 품목 categoryId, 예전 mainItemIds 호환. sqlite e2e는 마이그레이션을 돌리지 않으므로(Postgres 전용
// raw SQL) 마이그레이션이 넣는 10개 시드를 여기서 직접 넣는다. 테스트 데이터는 모두 이 테스트가 만든 것이다.
describe('품목군 CRUD · 공급업체 취급 품목군 · 품목 categoryId (PR-183)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const tag = Date.now();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `mat-cat-e2e-${tag}@test.com`;
    await request(http()).post('/auth/register').send({ email, password: 'password123!', name: 'MatCat E2E' });
    await dataSource.getRepository(User).update({ email }, { role: UserRole.MANAGER });
    token = (await request(http()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;

    // 마이그레이션 시드와 같은 10개(sortOrder 1~10). 이름은 테스트 간 충돌하지 않도록 태그를 붙이지 않는다(고유 제약이 있어 한 번만 넣는다).
    await dataSource.getRepository(MaterialCategory).save(
      ['겉감', '안감', '심지', '실', '테이프', '밴드', '라벨', '택', '스티커', '기타'].map((name, i) => ({
        name, sortOrder: i + 1, isActive: true,
      })),
    );
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const categoryByName = async (name: string) =>
    (await dataSource.getRepository(MaterialCategory).findOneBy({ name }))!;

  it('시드 10개가 sortOrder 순으로 나오고 활성 우선으로 정렬된다', async () => {
    const res = await auth(request(http()).get('/material-categories')).expect(200);
    const names = res.body.data.map((c: any) => c.name);
    expect(names.slice(0, 10)).toEqual(['겉감', '안감', '심지', '실', '테이프', '밴드', '라벨', '택', '스티커', '기타']);
  });

  it('품목군을 추가하고, 같은 이름은 409로 거절하며, 이름/정렬/활성 상태를 수정할 수 있다', async () => {
    const created = await auth(request(http()).post('/material-categories')).send({ name: `신규-${tag}`, sortOrder: 20 }).expect(201);
    expect(created.body.data).toEqual(expect.objectContaining({ name: `신규-${tag}`, sortOrder: 20, isActive: true }));

    await auth(request(http()).post('/material-categories')).send({ name: `신규-${tag}` }).expect(409);

    const updated = await auth(request(http()).patch(`/material-categories/${created.body.data.id}`))
      .send({ sortOrder: 21, isActive: false }).expect(200);
    expect(updated.body.data).toEqual(expect.objectContaining({ sortOrder: 21, isActive: false }));

    // 비활성은 목록 뒤쪽으로 간다(활성 우선).
    const list = (await auth(request(http()).get('/material-categories')).expect(200)).body.data;
    const idx = list.findIndex((c: any) => c.id === created.body.data.id);
    expect(list.slice(0, idx).every((c: any) => c.isActive)).toBe(true);
  });

  it('공급업체가 쓰는 품목군은 삭제가 400이고 메시지가 비활성 안내를 담으며, 쓰지 않는 품목군은 삭제된다', async () => {
    const used = await categoryByName('심지');
    const supplier = await auth(request(http()).post('/suppliers')).send({ name: `심지 공급사 ${tag}`, categoryIds: [used.id] }).expect(201);

    const denied = await auth(request(http()).delete(`/material-categories/${used.id}`)).expect(400);
    expect(JSON.stringify(denied.body)).toContain('비활성');

    const unused = await categoryByName('기타');
    await auth(request(http()).delete(`/material-categories/${unused.id}`)).expect(200);
    expect(await dataSource.getRepository(MaterialCategory).findOneBy({ id: unused.id })).toBeNull();
    // 정리: 이 테스트가 만든 공급업체는 그대로 둔다(다른 케이스에서 쓰지 않음).
    expect(supplier.body.data.id).toBeDefined();
  });

  it('품목이 쓰는 품목군도 삭제가 400이다(품목 categoryId는 선택, 없으면 null)', async () => {
    const cat = await categoryByName('라벨');
    const item = await auth(request(http()).post('/items')).send({
      code: `MAT-CAT-${tag}`, name: `라벨 원단 ${tag}`, type: 'RAW_MATERIAL', categoryId: cat.id,
    }).expect(201);
    expect(item.body.data.categoryId).toBe(cat.id);
    await auth(request(http()).delete(`/material-categories/${cat.id}`)).expect(400);

    const plain = await auth(request(http()).post('/items')).send({
      code: `MAT-NOCAT-${tag}`, name: `무품목군 ${tag}`, type: 'RAW_MATERIAL',
    }).expect(201);
    expect(plain.body.data.categoryId ?? null).toBeNull();

    // 존재하지 않는 품목군 id는 400.
    await auth(request(http()).post('/items')).send({
      code: `MAT-BAD-${tag}`, name: `잘못된 ${tag}`, type: 'RAW_MATERIAL', categoryId: 999999,
    }).expect(400);
  });

  describe('공급업체 취급 품목군(categoryIds)', () => {
    let abc: number;
    let cloth: number;
    let thread: number;
    beforeAll(async () => {
      abc = (await categoryByName('겉감')).id;
      cloth = (await categoryByName('안감')).id;
      thread = (await categoryByName('실')).id;
    });

    it('categoryIds를 여러 개 주면 모두 연결되어 응답의 categories에 실린다', async () => {
      const res = await auth(request(http()).post('/suppliers')).send({ name: `다품목군 ${tag}`, categoryIds: [abc, thread] }).expect(201);
      expect(res.body.data.categories.map((c: any) => c.id).sort()).toEqual([abc, thread].sort());
    });

    it('categoryIds를 빈 배열로 보내면 연결 없이 저장된다', async () => {
      const res = await auth(request(http()).post('/suppliers')).send({ name: `무품목군 ${tag}`, categoryIds: [] }).expect(201);
      expect(res.body.data.categories).toEqual([]);
    });

    it('없는 품목군 id가 섞이면 400이고 공급업체가 만들어지지 않는다', async () => {
      const before = (await auth(request(http()).get('/suppliers')).expect(200)).body.data.length;
      await auth(request(http()).post('/suppliers')).send({ name: `잘못된 ${tag}`, categoryIds: [abc, 999999] }).expect(400);
      const after = (await auth(request(http()).get('/suppliers')).expect(200)).body.data.length;
      expect(after).toBe(before);
    });

    it('update에서 categoryIds를 생략하면 기존 연결이 그대로, 빈 배열이면 전부 해제, 새 목록이면 교체된다', async () => {
      const created = await auth(request(http()).post('/suppliers')).send({ name: `수정용 ${tag}`, categoryIds: [abc] }).expect(201);
      const id = created.body.data.id;

      const kept = await auth(request(http()).patch(`/suppliers/${id}`)).send({ name: `수정용 ${tag} 2` }).expect(200);
      expect(kept.body.data.categories.map((c: any) => c.id)).toEqual([abc]);

      const replaced = await auth(request(http()).patch(`/suppliers/${id}`)).send({ categoryIds: [cloth, thread] }).expect(200);
      expect(replaced.body.data.categories.map((c: any) => c.id).sort()).toEqual([cloth, thread].sort());

      const cleared = await auth(request(http()).patch(`/suppliers/${id}`)).send({ categoryIds: [] }).expect(200);
      expect(cleared.body.data.categories).toEqual([]);
    });

    it('목록을 categoryId로 거르면 그 품목군을 취급하는 업체만 나온다', async () => {
      const onlyThread = await auth(request(http()).post('/suppliers')).send({ name: `실만 ${tag}`, categoryIds: [thread] }).expect(201);
      const filtered = (await auth(request(http()).get('/suppliers').query({ categoryId: thread })).expect(200)).body.data;
      expect(filtered.every((s: any) => s.categories.some((c: any) => c.id === thread))).toBe(true);
      expect(filtered.map((s: any) => s.id)).toContain(onlyThread.body.data.id);
    });

    it('예전 mainItemIds는 여전히 받아들여 연결되고, 품목군 목록과는 별개로 mainItems에 남는다(호환)', async () => {
      const item = await auth(request(http()).post('/items')).send({ code: `MAT-LEG-${tag}`, name: `예전품목 ${tag}`, type: 'RAW_MATERIAL' }).expect(201);
      const res = await auth(request(http()).post('/suppliers')).send({
        name: `예전방식 ${tag}`, mainItemIds: [item.body.data.id],
      }).expect(201);
      expect(res.body.data.mainItems.map((i: any) => i.id)).toEqual([item.body.data.id]);
      expect(res.body.data.categories).toEqual([]);
    });
  });
});
