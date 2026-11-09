import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-commit-name-normalize-flow.sqlite');
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = TEST_DB_PATH;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Item, ItemType } from '../src/items/entities/item.entity';

// PR-233: 같은 작지를 여러 번 재인식·저장할 때 AI가 자재명을 공백/괄호 종류/대소문자만
// 다르게 내도 Item/BomItem이 중복 생성되어 필요수량이 두 배가 되던 버그(PILOT-23)를
// commit()의 자재명 매칭을 정규화 일치(normalizeForFuzzyMatch, PR-198)로 올려 막는다.
// 합성 자재명/스타일번호만 사용(실제 업무 데이터 아님), sqlite 테스트 DB만 사용.
describe('작지 재저장 시 자재명 정규화 매칭 회귀 테스트 (PR-233)', () => {
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

    const email = `commit-name-normalize-e2e-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123!', name: 'Commit Normalize E2E' });
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

  it('같은 이름으로 재저장해도 Item/BomItem이 늘어나지 않는다', async () => {
    const styleNo = `E2E-NORM-SAME-${Date.now()}`;
    const name = `PR233_SAME_${Date.now()}`;

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName: name, consumption: 1, requiredQty: 100 }],
    });
    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName: name, consumption: 1, requiredQty: 100 }],
    });

    const items = await dataSource.query('SELECT * FROM items WHERE name = ?', [name]);
    expect(items).toHaveLength(1);

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(1);
    expect(Number(bomItems[0].requiredQty)).toBe(100); // 두 배(200)가 아니다.
  });

  it('공백/괄호 종류/대소문자만 다른 이름으로 재저장해도 병합된다(필요수량 두 배 아님)', async () => {
    const styleNo = `E2E-NORM-VARIANT-${Date.now()}`;
    const base = `PR233Mat${Date.now()}`;
    const variants = [
      `${base}Fabric<실크>`,
      `${base}fabric(실크)`,
      ` ${base}FABRIC <실크> `,
    ];

    for (const itemName of variants) {
      await commit({
        styleNo,
        overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
        bomItems: [{ category: 'FABRIC', itemName, consumption: 1, requiredQty: 100 }],
      });
    }

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(1); // 3번 재저장해도 한 행.
    expect(Number(bomItems[0].requiredQty)).toBe(100); // 300(=3배)이 아니다.

    const materialIds = [...new Set(bomItems.map((b: any) => b.materialId))];
    expect(materialIds).toHaveLength(1);
  });

  it('괄호 안 내용이 다른 자재(예: <면> vs <실크>)는 합쳐지지 않고 둘 다 남는다', async () => {
    const styleNo = `E2E-NORM-DIFF-${Date.now()}`;
    const base = `PR233Diff${Date.now()}`;
    const cottonName = `${base}<면>`;
    const silkName = `${base}<실크>`;

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [
        { category: 'FABRIC', itemName: cottonName, consumption: 1, requiredQty: 100 },
        { category: 'FABRIC', itemName: silkName, consumption: 1, requiredQty: 100 },
      ],
    });

    const cottonRow = await dataSource.query('SELECT id FROM items WHERE name = ?', [cottonName]);
    const silkRow = await dataSource.query('SELECT id FROM items WHERE name = ?', [silkName]);
    expect(cottonRow).toHaveLength(1);
    expect(silkRow).toHaveLength(1);
    expect(cottonRow[0].id).not.toBe(silkRow[0].id);

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(2); // 서로 다른 자재 — 합쳐지지 않음.
  });

  it('같은 자재라도 색상이 다르면(정규화와 무관하게) 별개 행으로 유지된다', async () => {
    const styleNo = `E2E-NORM-COLOR-${Date.now()}`;
    const base = `PR233Color${Date.now()}`;
    const nameA = `${base}<실크>`;
    const nameB = `${base}(실크)`; // 정규화하면 nameA와 동일 자재.

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 200, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [
        { category: 'FABRIC', itemName: nameA, colorCode: 'X', consumption: 1, requiredQty: 100 },
        { category: 'FABRIC', itemName: nameB, colorCode: 'Y', consumption: 1, requiredQty: 100 },
      ],
    });

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(2); // 색상이 달라 별개 행.
    const materialIds = [...new Set(bomItems.map((b: any) => b.materialId))];
    expect(materialIds).toHaveLength(1); // 하지만 같은 자재(Item)로 병합됨.
  });

  it('정규화 이름이 같은 Item이 이미 여러 개 있으면(과거 중복) 가장 오래된 id를 재사용한다', async () => {
    const styleNo = `E2E-NORM-OLDEST-${Date.now()}`;
    const base = `PR233Oldest${Date.now()}`;
    const olderName = `${base}<실크>`;
    const newerName = `${base}(실크)`; // 정규화하면 olderName과 동일.

    const itemRepo = dataSource.getRepository(Item);
    const older = await itemRepo.save(
      itemRepo.create({ code: `MAT-OLD-${Date.now()}`, name: olderName, type: ItemType.RAW_MATERIAL, unit: 'EA' }),
    );
    const newer = await itemRepo.save(
      itemRepo.create({ code: `MAT-NEW-${Date.now()}`, name: newerName, type: ItemType.RAW_MATERIAL, unit: 'EA' }),
    );
    expect(older.id).toBeLessThan(newer.id);

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      // 정규화하면 둘 다와 일치하는 제3의 표기로 재저장 — 더 오래된 쪽(older)을 재사용해야 한다.
      bomItems: [{ category: 'FABRIC', itemName: `${base} <실크> `, consumption: 1, requiredQty: 100 }],
    });

    const bom = await dataSource.query('SELECT * FROM bom_master WHERE styleStyleNo = ?', [styleNo]);
    const bomItems = await dataSource.query('SELECT * FROM bom_item_details WHERE bomId = ?', [bom[0].id]);
    expect(bomItems).toHaveLength(1);
    expect(bomItems[0].materialId).toBe(older.id); // 가장 오래된 id 재사용, 새 Item 생성 안 함.

    const totalMatchingItems = await itemRepo
      .createQueryBuilder('item')
      .where('item.name IN (:...names)', { names: [olderName, newerName] })
      .getCount();
    expect(totalMatchingItems).toBe(2); // 기존 중복 2개는 이 PR의 범위 밖 — 정리되지 않고 그대로.
  });

  it('재저장 후에도 수동으로 수정한 혼용률/실 종류가 보존된다', async () => {
    const styleNo = `E2E-NORM-MANUAL-${Date.now()}`;
    const base = `PR233Manual${Date.now()}`;
    const firstName = `${base}<실크>`;
    const resavedName = `${base}(실크)`; // 정규화하면 동일 자재 — 같은 BomItem 행을 가리켜야 한다.

    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName: firstName, consumption: 1, requiredQty: 100 }],
    });

    const bomRes = await request(app.getHttpServer())
      .get('/boms')
      .query({ styleNo })
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const bomItem = bomRes.body.data.items[0];

    await request(app.getHttpServer())
      .patch(`/boms/items/${bomItem.id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ composition: 'SILK 100%', threadType: 'COA_SA' })
      .expect(200);

    // 재저장(표기만 다른 이름) — 기존 행을 건드리지 않아야 한다(값 다르면 NEEDS_REVIEW만, 자동 반영 안 함).
    await commit({
      styleNo,
      overviewData: { styleNo, totalQty: 100, factory: '베트남', buyer: 'E2E바이어', shipDate: '' },
      bomItems: [{ category: 'FABRIC', itemName: resavedName, consumption: 1, requiredQty: 100 }],
    });

    const afterRes = await request(app.getHttpServer())
      .get('/boms')
      .query({ styleNo })
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(afterRes.body.data.items).toHaveLength(1); // 새 행이 생기지 않았다(같은 자재로 병합됨).
    const afterItem = afterRes.body.data.items[0];
    expect(afterItem.id).toBe(bomItem.id);
    expect(afterItem.composition).toBe('SILK 100%');
    expect(afterItem.threadType).toBe('COA_SA');
  });
});
