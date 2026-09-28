import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MidoPriceItem } from './entities/mido-price-item.entity';
import { MidoPriceTableService } from './mido-price-table.service';
import { MidoPriceTableController } from './mido-price-table.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MidoPriceItem])],
  controllers: [MidoPriceTableController],
  providers: [MidoPriceTableService],
  exports: [MidoPriceTableService],
})
export class MidoPriceTableModule {}
