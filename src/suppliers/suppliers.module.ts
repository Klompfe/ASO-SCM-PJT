import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { Supplier } from './entities/supplier.entity';
import { Item } from '../items/entities/item.entity';
import { MaterialCategory } from '../material-categories/entities/material-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, Item, MaterialCategory])],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
