import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';
import { User } from '../users/entities/user.entity';
import { Bom } from '../items/entities/bom.entity';
import { Inventory } from '../inventories/entities/inventory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrder,
      Item,
      User,
      Bom,
      Inventory,
    ]),
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService, TypeOrmModule],
})
export class WorkOrdersModule {}