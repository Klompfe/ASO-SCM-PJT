import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PackingReceipt } from '../purchase-orders/entities/packing-receipt.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ExportShipment } from './entities/export-shipment.entity';
import { ExportShipmentLine } from './entities/export-shipment-line.entity';
import { ExportShipmentsService } from './export-shipments.service';
import { ExportShipmentsController } from './export-shipments.controller';
import { ExportShipmentDefaultsModule } from '../export-shipment-defaults/export-shipment-defaults.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PackingReceipt, BomItem, ExportShipment, ExportShipmentLine]),
    ExportShipmentDefaultsModule,
  ],
  controllers: [ExportShipmentsController],
  providers: [ExportShipmentsService],
})
export class ExportShipmentsModule {}
