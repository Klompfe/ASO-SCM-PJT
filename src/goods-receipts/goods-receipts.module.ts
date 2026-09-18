import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { ImportShipmentPackingDetail } from '../import-shipments/entities/import-shipment-packing-detail.entity';
import { ImportShipment } from '../import-shipments/entities/import-shipment.entity';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';

@Module({
  imports: [
    // export-shipments.module.ts가 PurchaseOrder/PackingReceipt를 직접 등록하는
    // 것과 동일한 패턴 — import-shipments 모듈 전체를 가져오지 않고 필요한
    // 엔티티(ImportShipmentPackingDetail/ImportShipment)만 리포지토리로 등록한다.
    TypeOrmModule.forFeature([GoodsReceipt, GoodsReceiptLine, ImportShipmentPackingDetail, ImportShipment]),
  ],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
