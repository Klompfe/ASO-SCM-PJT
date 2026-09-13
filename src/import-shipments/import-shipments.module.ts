import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportShipment } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipmentsController } from './import-shipments.controller';
import { HsCodeClassificationsModule } from '../hs-code-classifications/hs-code-classifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportShipment, ImportShipmentLine]),
    HsCodeClassificationsModule,
  ],
  controllers: [ImportShipmentsController],
  providers: [ImportShipmentsService],
  exports: [ImportShipmentsService],
})
export class ImportShipmentsModule {}
