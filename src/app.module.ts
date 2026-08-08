import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { InventoriesModule } from './inventories/inventories.module';

import { User } from './users/entities/user.entity';
import { Item } from './items/entities/item.entity';
import { Bom } from './items/entities/bom.entity';
import { WorkOrder } from './work-orders/entities/work-order.entity';
import { Inventory } from './inventories/entities/inventory.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'scm_db'),
        entities: [User, Item, Bom, WorkOrder, Inventory],
        synchronize: true, // 개발 환경용
      }),
    }),
    AuthModule,
    UsersModule,
    ItemsModule,
    WorkOrdersModule,
    InventoriesModule,
  ],
})
export class AppModule {}