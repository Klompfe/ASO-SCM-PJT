import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

// Entity Imports
// 아래 엔티티들은 각 도메인 모듈의 TypeOrmModule.forFeature()를 통해 이미 등록되며,
// autoLoadEntities: true가 그 등록을 자동으로 반영하므로 여기서 중복 나열하지 않는다.
// Material/Color/Size는 이들을 forFeature로 등록하는 모듈이 없어 여기서만 로드된다.
import { Material, Color, Size } from './master/entities/master.entities';

// Module Imports
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { InventoriesModule } from './inventories/inventories.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { MappingModule } from './mapping/mapping.module';
import { MasterModule } from './master/master.module';
import { TransactionModule } from './transaction/transaction.module';
import { StylesModule } from './styles/styles.module';
import { BuyersModule } from './buyers/buyers.module';
import { ExportShipmentsModule } from './export-shipments/export-shipments.module';
import { ExportShipmentDefaultsModule } from './export-shipment-defaults/export-shipment-defaults.module';
import { HsCodeClassificationsModule } from './hs-code-classifications/hs-code-classifications.module';
import { SalesContractPricesModule } from './sales-contract-prices/sales-contract-prices.module';
import { ImportShipmentsModule } from './import-shipments/import-shipments.module';
import { ProductionContractsModule } from './production-contracts/production-contracts.module';
import { CashVouchersModule } from './cash-vouchers/cash-vouchers.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { BrandPrefixRulesModule } from './brand-prefix-rules/brand-prefix-rules.module';
import { MaterialPackagingUnitRulesModule } from './material-packaging-unit-rules/material-packaging-unit-rules.module';
import { CustomsExchangeRatesModule } from './customs-exchange-rates/customs-exchange-rates.module';
import { MaterialCategoriesModule } from './material-categories/material-categories.module';
import { StatusCodesModule } from './status-codes/status-codes.module';
import { MidoPriceTableModule } from './mido-price-table/mido-price-table.module';
import { HealthController } from './health/health.controller';
import { getPostgresConnectionOptions } from './common/database/postgres-connection-options';
import { shouldSynchronizePostgres } from './common/database/should-synchronize-postgres.util';

@Module({
  imports: [
    // 환경 변수 전역 설정
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // 데이터베이스 동적 연결 설정 (SQLite / PostgreSQL 지원)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE') || 'postgres';

        if (dbType === 'sqlite') {
          // sqlite는 로컬 개발/e2e 전용이라 기존처럼 NODE_ENV 기준을 그대로 쓴다(FIX-1
          // 재발 방지는 "원격 DB"에 적용되는 문제라 sqlite 경로와는 무관).
          return {
            type: 'sqlite',
            database: configService.get<string>('DB_DATABASE', 'scm_db.sqlite'),
            entities: [Material, Color, Size],
            synchronize: configService.get<string>('NODE_ENV') !== 'production',
            autoLoadEntities: true,
          };
        }

        // FIX-1: Postgres는 더 이상 NODE_ENV로 synchronize를 결정하지 않는다 — `.env`가
        // 운영(원격) DB를 가리킨 채 NODE_ENV=production을 빼먹고 실행하면 synchronize가
        // 조용히 켜져 엔티티에 없는 컬럼을 운영 DB에서 지워버리는 사고가 두 차례 있었다
        // (purchase_order.orderType, export_shipment_lines.materialSubType/priceBasisNote).
        // 이제는 DB_SYNCHRONIZE=true로 명시적으로 켜야 하고, 그마저도 로컬 Postgres
        // 호스트(localhost/127.0.0.1/docker-compose의 'postgres')가 아니면 서버가 뜨지
        // 않도록 에러를 던진다(shouldSynchronizePostgres, 단위 테스트로 조합을 검증).
        return {
          type: 'postgres',
          ...getPostgresConnectionOptions(),
          entities: [Material, Color, Size],
          synchronize: shouldSynchronizePostgres({
            dbSynchronize: configService.get<string>('DB_SYNCHRONIZE'),
            dbHost: configService.get<string>('DB_HOST'),
          }),
          autoLoadEntities: true,
        };
      },
    }),

    // 도메인 기능 모듈
    AuthModule,
    UsersModule,
    ItemsModule,
    InventoriesModule,
    PurchaseOrdersModule,
    StatusCodesModule,
    MidoPriceTableModule,
    WorkOrdersModule,
    SalesOrdersModule,
    SuppliersModule,
    ShipmentsModule,
    MappingModule,
    MasterModule,
    TransactionModule,
    StylesModule,
    BuyersModule,
    ExportShipmentsModule,
    ExportShipmentDefaultsModule,
    HsCodeClassificationsModule,
    SalesContractPricesModule,
    ImportShipmentsModule,
    ProductionContractsModule,
    CashVouchersModule,
    GoodsReceiptsModule,
    BrandPrefixRulesModule,
    MaterialPackagingUnitRulesModule,
    CustomsExchangeRatesModule,
    MaterialCategoriesModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}