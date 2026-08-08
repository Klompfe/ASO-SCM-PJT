import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoriesService } from './inventories.service';
import { InventoriesController } from './inventories.controller';
import { Inventory } from './entities/inventory.entity';
import { Item } from '../items/entities/item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, Item])],
  controllers: [InventoriesController],
  providers: [InventoriesService],
  exports: [InventoriesService, TypeOrmModule],
})
export class InventoriesModule {}