import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportShipment } from './entities/import-shipment.entity';
import { ImportShipmentLine } from './entities/import-shipment-line.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { ImportShipmentsService } from './import-shipments.service';
import { ImportShipmentsController } from './import-shipments.controller';
import { HsCodeClassificationsModule } from '../hs-code-classifications/hs-code-classifications.module';

@Module({
  imports: [
    // PR-083: importFromFile()이 엑셀에서 읽은 styleNo가 MasterStyle에 실제로
    // 존재하는지 미리 확인하기 위해 직접 등록한다(export-shipments.module.ts가
    // PurchaseOrder/PackingReceipt/BomItem을 같은 방식으로 등록하는 것과 동일 패턴).
    TypeOrmModule.forFeature([ImportShipment, ImportShipmentLine, MasterStyle]),
    HsCodeClassificationsModule,
  ],
  controllers: [ImportShipmentsController],
  providers: [ImportShipmentsService],
  exports: [ImportShipmentsService],
})
export class ImportShipmentsModule {}
