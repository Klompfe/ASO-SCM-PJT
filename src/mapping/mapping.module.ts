import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MappingRule } from './entities/mapping-rule.entity';
import { Item } from '../items/entities/item.entity';
import { Style } from '../master/entities/master.entities';
import { MappingService } from './services/mapping.service';
import { ValidationService } from './services/validation.service';
import { MappingController } from './mapping.controller';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [TypeOrmModule.forFeature([MappingRule, Item, Style]), ItemsModule],
  controllers: [MappingController],
  providers: [MappingService, ValidationService],
  exports: [MappingService, ValidationService],
})
export class MappingModule {}
