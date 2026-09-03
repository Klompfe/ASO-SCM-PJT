import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bom, BomItem])],
  exports: [TypeOrmModule],
})
export class BomsModule {}
