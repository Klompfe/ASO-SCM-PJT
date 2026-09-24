import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { StatusCodesModule } from '../status-codes/status-codes.module';

// PR-133: 내부 생산 실행 지시(작업지시)만 다룬다. 수주(고객사로부터 받은 주문) 등록 흐름(작업지시서 업로드/AI 분석/저장)은
// SalesOrdersModule로 분리되었다 — 두 모듈은 서로 무관하다.
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    StatusCodesModule,
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
