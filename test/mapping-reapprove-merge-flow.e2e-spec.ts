import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-mapping-reapprove-merge-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MasterStyle } from '../src/styles/entities/master-style.entity';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';

// PR-130: "이미 등록됨" 스타일의 재승인 안내 문구(MappingPreviewModal)가 실제 commit() 동작과 같은지 실 DB로 못 박는다.
// 문구의 약속: (1) 자재가 중복으로 쌓이지 않는다 (2) 새로 나온 자재만 추가 (3) 기존 자재는 삭제되지 않는다
// (4) 스타일 정보는 값이 있는 항목만 갱신·빈 항목은 유지·공장은 기존 값이 있으면 유지 (5) 같은 자재의 요척/필요량이 달라도 자동 반영되지 않는다.
describe('이미 등록된 스타일 재승인 = 병합 (PR-130)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  const STYLE = 'MRG-STYLE-1';

  const commit = async (body: any) =>
    (await request(app.getHttpServer()).post('/mapping/commit').set('Authorization', `Bearer ${token}`).send(body).expect(201)).body;
  const bomItems = async () => {
    const boms = await dataSource.getRepository(Bom).find({ where: { style: { styleNo: STYLE } }, relations: ['items', 'items.material'] });
    return { bomCount: boms.length, items: boms.flatMap((b) => b.items) };
  };
  const overview = async () => (await dataSource.getRepository(MasterStyle).findOneOrFail({ where: { styleNo: STYLE }, relations: ['overview'] })).overview;
  const line = (itemName: string, consumption: number, requiredQty: number, colorCode = 'BK', spec = 'S') => ({ category: '겉감', itemName, colorCode, spec, consumption, requiredQty });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    dataSource = app.get(DataSource);
    const email = `mapping-merge-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123!', name: 'Mapping Merge' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123!' }).expect(201)).body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('최초 승인: 스타일/BOM 1건/자재 3건이 만들어지고 check-exists는 true가 된다', async () => {
    expect((await request(app.getHttpServer()).get(`/mapping/check-exists?styleNo=${STYLE}`).set('Authorization', `Bearer ${token}`).expect(200)).body.data.exists).toBe(false);
    const res = (await commit({
      styleNo: STYLE,
      overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 700, buyer: '바이어A', shipDate: '2026-01-16', styleName: '원래 스타일명' },
      bomItems: [line('MRG-원단', 1.47, 1029), line('MRG-안감', 0.8, 560), line('MRG-단추', 6, 4200)],
    })).data;
    expect(res).toMatchObject({ success: true, styleNo: STYLE });
    const { bomCount, items } = await bomItems();
    expect(bomCount).toBe(1);
    expect(items).toHaveLength(3);
    expect((await request(app.getHttpServer()).get(`/mapping/check-exists?styleNo=${STYLE}`).set('Authorization', `Bearer ${token}`).expect(200)).body.data.exists).toBe(true);
  });

  describe('재승인(같은 styleNo) — 문구가 약속한 병합 동작', () => {
    let secondResult: any;

    beforeAll(async () => {
      secondResult = (await commit({
        styleNo: STYLE,
        // 공장이 다름, 수량/바이어 변경, 선적일/스타일명은 값을 보내지 않음(비어 있음)
        overviewData: { styleNo: STYLE, factory: '인도네시아', totalQty: 900, buyer: '바이어B' },
        bomItems: [
          line('MRG-원단', 1.47, 1029), // 기존과 동일 → 건드리지 않음
          line('MRG-안감', 0.9, 630), // 기존 자재인데 요척/필요량이 다름 → 자동 반영 안 함
          line('MRG-지퍼', 1, 700), // 새 자재 → 추가
          // MRG-단추는 이번 파일에 없음 → 삭제되지 않아야 함
        ],
      })).data;
    });

    it('(1)(2) 자재는 중복으로 쌓이지 않고 새로 나온 자재(지퍼)만 추가된다: 3건 → 4건, BOM은 그대로 1건', async () => {
      const { bomCount, items } = await bomItems();
      expect(bomCount).toBe(1);
      expect(items).toHaveLength(4);
      expect(items.map((i) => i.material.name).sort()).toEqual(['MRG-단추', 'MRG-안감', 'MRG-원단', 'MRG-지퍼']);
      const names = items.map((i) => `${i.material.name}|${i.colorCode}|${i.spec}`);
      expect(new Set(names).size).toBe(names.length); // (자재명, 색상, 규격) 중복 없음
    });

    it('(3) 이번 파일에 없는 기존 자재(단추)는 삭제되지 않는다', async () => {
      const { items } = await bomItems();
      const button = items.find((i) => i.material.name === 'MRG-단추');
      expect(button).toBeDefined();
      expect(Number(button!.requiredQty)).toBe(4200);
    });

    it('(5) 같은 자재의 요척/필요량이 달라도 자동 반영되지 않고(기존 값 유지) 차이는 응답 warnings에만 남는다', async () => {
      const { items } = await bomItems();
      const lining = items.find((i) => i.material.name === 'MRG-안감')!;
      expect(Number(lining.consumption)).toBe(0.8);
      expect(Number(lining.requiredQty)).toBe(560);
      expect(secondResult.warnings.some((w: string) => w.includes('MRG-안감') && w.includes('자동 반영하지 않음'))).toBe(true);
      // 값이 같은 원단은 경고도 없다
      expect(secondResult.warnings.some((w: string) => w.includes('MRG-원단'))).toBe(false);
    });

    it('(4) 스타일 정보: 값이 있는 항목(수량/바이어)은 갱신, 비어 있는 항목(선적일/스타일명)은 기존 유지, 공장은 기존 값 유지 + 경고', async () => {
      const ov = await overview();
      expect(Number(ov.totalQty)).toBe(900); // 새 값으로 갱신
      expect(ov.buyer).toBe('바이어B'); // 새 값으로 갱신
      expect(ov.styleName).toBe('원래 스타일명'); // 비어 있어 기존 유지
      expect(new Date(ov.firstShipDate as any).toISOString().slice(0, 10)).toBe('2026-01-16'); // 비어 있어 기존 유지
      expect(ov.factory).toBe('베트남'); // 공장은 기존 값이 있으면 바뀌지 않는다
      expect(secondResult.warnings.some((w: string) => w.includes('factory') && w.includes('인도네시아'))).toBe(true);
    });

    it('같은 내용으로 한 번 더 재승인해도 자재는 더 늘지 않는다(멱등): 4건 유지', async () => {
      await commit({
        styleNo: STYLE,
        overviewData: { styleNo: STYLE, factory: '인도네시아', totalQty: 900, buyer: '바이어B' },
        bomItems: [line('MRG-원단', 1.47, 1029), line('MRG-안감', 0.9, 630), line('MRG-지퍼', 1, 700)],
      });
      const { bomCount, items } = await bomItems();
      expect(bomCount).toBe(1);
      expect(items).toHaveLength(4);
    });

    it('같은 자재라도 색상이나 규격이 다르면 새 자재로 추가된다(병합 키는 자재명·색상·규격)', async () => {
      await commit({
        styleNo: STYLE,
        overviewData: { styleNo: STYLE, factory: '베트남', totalQty: 900, buyer: '바이어B' },
        bomItems: [line('MRG-원단', 1.47, 1029, 'NV', 'S')], // 색상만 다름
      });
      const { items } = await bomItems();
      expect(items).toHaveLength(5);
      expect(items.filter((i) => i.material.name === 'MRG-원단').map((i) => i.colorCode).sort()).toEqual(['BK', 'NV']);
    });
  });
});
