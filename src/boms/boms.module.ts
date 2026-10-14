import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { Item } from '../items/entities/item.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Bom, BomItem, Item, PurchaseOrder])],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [TypeOrmModule],
})
export class BomsModule {}
