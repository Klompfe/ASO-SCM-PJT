import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { WorkOrder } from './entities/work-order.entity';
import { WorkOrderSpec } from './entities/work-order-spec.entity';
import { WorkOrderSizeSpecRow } from './entities/work-order-size-spec-row.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { VisionService } from './vision.service';
import { WorkOrderSpecsService } from './work-order-specs.service';
import { BomsModule } from '../boms/boms.module';
import { MappingModule } from '../mapping/mapping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, WorkOrderSpec, WorkOrderSizeSpecRow, Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    BomsModule,
    MappingModule,
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, VisionService, WorkOrderSpecsService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
