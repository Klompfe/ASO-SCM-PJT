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
import { ImportShipmentsModule } from './import-shipments/import-shipments.module';
import { ProductionContractsModule } from './production-contracts/production-contracts.module';
import { CashVouchersModule } from './cash-vouchers/cash-vouchers.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { BrandPrefixRulesModule } from './brand-prefix-rules/brand-prefix-rules.module';
import { StatusCodesModule } from './status-codes/status-codes.module';
import { HealthController } from './health/health.controller';
import { getPostgresConnectionOptions } from './common/database/postgres-connection-options';

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
        // 프로덕션(NODE_ENV=production)에서는 synchronize를 끄고 마이그레이션으로만
        // 스키마를 관리한다(PR-058) — synchronize:true를 배포 DB에 그대로 켜두면
        // 엔티티 변경이 검토 없이 즉시 스키마에 반영되는 사고 위험이 있다.
        const synchronize = configService.get<string>('NODE_ENV') !== 'production';

        if (dbType === 'sqlite') {
          return {
            type: 'sqlite',
            database: configService.get<string>('DB_DATABASE', 'scm_db.sqlite'),
            entities: [Material, Color, Size],
            synchronize,
            autoLoadEntities: true,
          };
        }

        return {
          type: 'postgres',
          ...getPostgresConnectionOptions(),
          entities: [Material, Color, Size],
          synchronize,
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
    ImportShipmentsModule,
    ProductionContractsModule,
    CashVouchersModule,
    GoodsReceiptsModule,
    BrandPrefixRulesModule,
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