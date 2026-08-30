import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entity Imports
import { User } from './users/entities/user.entity';
import { Item } from './items/entities/item.entity';
import { Inventory } from './inventories/entities/inventory.entity';
import { PurchaseOrder } from './purchase-orders/entities/purchase-order.entity';
import { WorkOrder } from './work-orders/entities/work-order.entity';
import { Supplier } from './suppliers/entities/supplier.entity';
import { Shipment } from './shipments/entities/shipment.entity'; // Shipment 엔티티 추가
import { MappingRule } from './mapping/entities/mapping-rule.entity';
import { Style, Material, Color, Size } from './master/entities/master.entities';
import { Bom, Receiving } from './transaction/entities/transaction.entities';

// Module Imports
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { InventoriesModule } from './inventories/inventories.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { MappingModule } from './mapping/mapping.module';
import { MasterModule } from './master/master.module';
import { TransactionModule } from './transaction/transaction.module';

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
          return {
            type: 'sqlite',
            database: configService.get<string>('DB_DATABASE', 'scm_db.sqlite'),
            entities: [User, Item, Inventory, PurchaseOrder, WorkOrder, Supplier, Shipment, MappingRule, Style, Material, Color, Size, Bom, Receiving],
            synchronize: true, // 개발용 자동 스키마 동기화
            autoLoadEntities: true,
          };
        }

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', 'postgres'),
          database: configService.get<string>('DB_DATABASE', 'scm_db'),
          entities: [User, Item, Inventory, PurchaseOrder, WorkOrder, Supplier, Shipment, MappingRule, Style, Material, Color, Size, Bom, Receiving],
          synchronize: true,
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
    WorkOrdersModule,
    SuppliersModule,
    ShipmentsModule,
    MappingModule,
    MasterModule,
    TransactionModule,
  ],
})
export class AppModule {}