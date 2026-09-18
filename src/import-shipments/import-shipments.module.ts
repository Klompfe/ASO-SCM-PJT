import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportShipment } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { ImportShipmentPackingDetail } from './entities/import-shipment-packing-detail.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { GoodsReceiptLine } from '../goods-receipts/entities/goods-receipt-line.entity';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipmentsController } from './import-shipments.controller';
import { ImportShipmentPackingDetailsService } from './import-shipment-packing-details.service';
import { ImportShipmentPackingDetailsController } from './import-shipment-packing-details.controller';
import { HsCodeClassificationsModule } from '../hs-code-classifications/hs-code-classifications.module';

@Module({
  imports: [
    // PR-083: importFromFile()이 엑셀에서 읽은 styleNo가 MasterStyle에 실제로
    // 존재하는지 미리 확인하기 위해 직접 등록한다(export-shipments.module.ts가
    // PurchaseOrder/PackingReceipt/BomItem을 같은 방식으로 등록하는 것과 동일 패턴).
    // PR-107: GoodsReceiptLine도 같은 이유로 직접 등록한다(goods-receipts 모듈
    // 전체를 가져오지 않고, "이미 입고증 작성됨" 여부만 조회하기 위한 리포지토리).
    TypeOrmModule.forFeature([
      ImportShipment,
      ImportShipmentLine,
      ImportShipmentPackingDetail,
      MasterStyle,
      GoodsReceiptLine,
    ]),
    HsCodeClassificationsModule,
  ],
  controllers: [ImportShipmentsController, ImportShipmentPackingDetailsController],
  providers: [ImportShipmentsService, ImportShipmentPackingDetailsService],
  exports: [ImportShipmentsService],
})
export class ImportShipmentsModule {}
