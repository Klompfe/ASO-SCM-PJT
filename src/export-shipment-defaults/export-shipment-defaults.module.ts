import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportShipmentDefaults } from './entities/export-shipment-defaults.entity';
import { ExportShipmentDefaultsService } from './export-shipment-defaults.service';
import { ExportShipmentDefaultsController } from './export-shipment-defaults.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExportShipmentDefaults])],
  controllers: [ExportShipmentDefaultsController],
  providers: [ExportShipmentDefaultsService],
  exports: [ExportShipmentDefaultsService],
})
export class ExportShipmentDefaultsModule {}
