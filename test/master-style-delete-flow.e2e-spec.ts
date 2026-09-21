import * as path from 'path';
import * as fs from 'fs';

const TEST_DB_PATH = path.resolve(__dirname, '../test-db-master-style-delete-flow.sqlite');
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
import { MasterStyle } from '../src/styles/entities/master-style.entity';
import { StyleOverview } from '../src/styles/entities/style-overview.entity';
import { Contract } from '../src/styles/entities/contract.entity';
import { OrderProcessStage } from '../src/styles/entities/order-process-stage.entity';
import { OrderShipment } from '../src/styles/entities/order-shipment.entity';
import { Bom } from '../src/boms/entities/bom.entity';
import { BomItem } from '../src/boms/entities/bom-item.entity';

// [정리] DELETE /master-styles/:styleNo 신설 — MasterStyle과 관련된 모든 하위 데이터
// (StyleOverview/Bom/BomItem/Contract/OrderProcessStage/OrderShipment)가 실제로
// 트랜잭션으로 함께 지워지는지, RBAC(MANAGER/ADMIN)이 걸려 있는지 검증한다.
describe('MasterStyle 삭제(cascade) 회귀 테스트 (정리 PR)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  const registerAndLogin = async (email: string, role?: UserRole): Promise<string> => {
    const password = 'password123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Delete Flow Tester' })
      .expect(201);
    if (role) {
      await dataSource.getRepository(User).update({ email }, { role });
    }
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return loginRes.body.data.accessToken;
  };

  // 작업지시서 커밋(MasterStyle+StyleOverview+Bom+BomItem+Contract 자동 생성, PR-066)
  // 위에 공정 진행현황(OrderProcessStage)과 출고(OrderShipment)까지 별도로 등록해,
  // MasterStyle을 참조하는 5개 하위 엔티티 타입을 전부 채워둔 뒤 삭제를 검증한다.
  const createFullStyle = async (token: string): Promise<string> => {
    const styleNo = `DELETE-FLOW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await request(app.getHttpServer())
      .post('/sales-orders/commit-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        overview: {
          styleNo, styleName: 'Delete Flow Test', itemType: 'JK', brand: 'Test',
          productionType: 'FOB', factory: 'Test Factory', buyer: 'Test Buyer', totalQty: 100, targetRdd: '2027-01-01',
        },
        bomItems: [{ category: 'FABRIC', itemName: `${styleNo}-fabric`, spec: null, colorCode: null, consumption: 1, requiredQty: 100, supplier: null, remarks: null }],
        sizeSpecs: [{ part: '가슴단면', size: 'M', instructedValue: '50', sampleValue: null, diffValue: null, finalValue: null }],
        workNotes: null,
      })
      .expect(201);

    await request(app.getHttpServer())
      .put('/order-process-stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ styleNo, stage: 'CUTTING', targetQty: 100, completedQty: 50 })
      .expect(200);

    await request(app.getHttpServer())
      .post('/order-shipments')
      .set('Authorization', `Bearer ${token}`)
      .send({ styleNo, plannedShipDate: '2027-01-01', quantity: 50 })
      .expect(201);

    return styleNo;
  };

  it('USER 권한으로 DELETE /master-styles/:styleNo를 호출하면 403이어야 한다', async () => {
    const token = await registerAndLogin(`delete-user-${Date.now()}@test.com`);
    const styleNo = await createFullStyle(token);

    await request(app.getHttpServer())
      .delete(`/master-styles/${styleNo}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('존재하지 않는 styleNo를 삭제하려 하면 404여야 한다', async () => {
    const token = await registerAndLogin(`delete-404-${Date.now()}@test.com`, UserRole.MANAGER);
    await request(app.getHttpServer())
      .delete('/master-styles/NO-SUCH-STYLE-EVER')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('MANAGER 권한으로 삭제하면 200이고, 관련 하위 데이터(StyleOverview/Bom/BomItem/Contract/OrderProcessStage/OrderShipment)까지 실제로 전부 삭제되어야 한다', async () => {
    const token = await registerAndLogin(`delete-manager-${Date.now()}@test.com`, UserRole.MANAGER);
    const styleNo = await createFullStyle(token);

    // 삭제 전: 6개 관련 테이블에 실제로 데이터가 있는지 먼저 확인한다(삭제 검증의 전제).
    const style = await dataSource.getRepository(MasterStyle).findOne({ where: { styleNo }, relations: ['overview'] });
    expect(style).not.toBeNull();
    const overviewId = style!.overview.id;
    const bom = await dataSource.getRepository(Bom).findOne({ where: { style: { styleNo } } });
    expect(bom).not.toBeNull();
    const bomItemsBefore = await dataSource.getRepository(BomItem).find({ where: { bom: { id: bom!.id } } });
    expect(bomItemsBefore.length).toBeGreaterThan(0);
    const contractsBefore = await dataSource.getRepository(Contract).find({ where: { styleNo } });
    expect(contractsBefore.length).toBeGreaterThan(0);
    const stagesBefore = await dataSource.getRepository(OrderProcessStage).find({ where: { styleNo } });
    expect(stagesBefore.length).toBeGreaterThan(0);
    const shipmentsBefore = await dataSource.getRepository(OrderShipment).find({ where: { styleNo } });
    expect(shipmentsBefore.length).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .delete(`/master-styles/${styleNo}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.message).toContain(styleNo);

    // 삭제 후: MasterStyle 자체와 6개 하위 테이블 모두 비어 있어야 한다.
    expect(await dataSource.getRepository(MasterStyle).findOne({ where: { styleNo } })).toBeNull();
    expect(await dataSource.getRepository(StyleOverview).findOne({ where: { id: overviewId } })).toBeNull();
    expect(await dataSource.getRepository(Bom).findOne({ where: { id: bom!.id } })).toBeNull();
    expect(await dataSource.getRepository(BomItem).find({ where: { bom: { id: bom!.id } } })).toHaveLength(0);
    expect(await dataSource.getRepository(Contract).find({ where: { styleNo } })).toHaveLength(0);
    expect(await dataSource.getRepository(OrderProcessStage).find({ where: { styleNo } })).toHaveLength(0);
    expect(await dataSource.getRepository(OrderShipment).find({ where: { styleNo } })).toHaveLength(0);
  });

  it('삭제된 styleNo는 목록 조회에서도 더 이상 나타나지 않아야 한다', async () => {
    const token = await registerAndLogin(`delete-reget-${Date.now()}@test.com`, UserRole.MANAGER);
    const styleNo = await createFullStyle(token);

    await request(app.getHttpServer())
      .delete(`/master-styles/${styleNo}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/master-styles')
      .query({ styleNo })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.find((s: any) => s.styleNo === styleNo)).toBeUndefined();
  });
});
