import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { WorkOrder } from './entities/work-order.entity';
import { WorkOrderSpec } from './entities/work-order-spec.entity';
import { WorkOrderSizeSpecRow } from './entities/work-order-size-spec-row.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { VisionService } from './vision.service';
import { WorkOrderSpecsService } from './work-order-specs.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { BomsModule } from '../boms/boms.module';
import { MappingModule } from '../mapping/mapping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, WorkOrderSpec, WorkOrderSizeSpecRow, AiUsageLog, Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    BomsModule,
    MappingModule,
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, VisionService, WorkOrderSpecsService, AiUsageLogService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
