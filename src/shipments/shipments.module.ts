import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { ShipmentsController } from './shipments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Shipment])],
  controllers: [ShipmentsController],
  providers: [],
})
export class ShipmentsModule {}
