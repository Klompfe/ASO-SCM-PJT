import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { SalesOrderSpec } from './entities/sales-order-spec.entity';
import { SalesOrderSizeSpecRow } from './entities/sales-order-size-spec-row.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { VisionService } from './vision.service';
import { SalesOrderSpecsService } from './sales-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { BomsModule } from '../boms/boms.module';
import { MappingModule } from '../mapping/mapping.module';

// PR-133: 수주(고객사로부터 받은 주문) 등록 모듈. 내부 생산 실행 지시인 WorkOrdersModule과는 서로 무관하다.
@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrderSpec, SalesOrderSizeSpecRow, AiUsageLog]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    BomsModule,
    MappingModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, VisionService, SalesOrderSpecsService, AiUsageLogService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
