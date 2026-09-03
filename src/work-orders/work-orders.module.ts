import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { VisionService } from './vision.service';
import { BomsModule } from '../boms/boms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    BomsModule,
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, VisionService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
