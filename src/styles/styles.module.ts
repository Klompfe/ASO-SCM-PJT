import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview } from './entities/style-overview.entity';
import { Contract } from './entities/contract.entity';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { OrderShipment } from './entities/order-shipment.entity';
import { Bom } from '../boms/entities/bom.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { ExportShipmentLine } from '../export-shipments/entities/export-shipment-line.entity';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { OrderProcessStagesService } from './order-process-stages.service';
import { OrderProcessStagesController } from './order-process-stages.controller';
import { OrderShipmentsService } from './order-shipments.service';
import { OrderShipmentsController } from './order-shipments.controller';
import { OrderProgressSummaryService } from './order-progress-summary.service';
import { OrderProgressSummaryController } from './order-progress-summary.controller';
import { BrandPrefixRulesModule } from '../brand-prefix-rules/brand-prefix-rules.module';
import { SalesContractPricesModule } from '../sales-contract-prices/sales-contract-prices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MasterStyle,
      StyleOverview,
      Contract,
      OrderProcessStage,
      OrderShipment,
      Bom,
      PurchaseOrder,
      ExportShipmentLine,
    ]),
    // PR-111: 스타일번호 접두사로 브랜드를 분류하기 위해 규칙 목록이 필요하다.
    BrandPrefixRulesModule,
    // PR-166: 계약서 발행 시 CMT매입단가 표준가격을 자동 조회하기 위해 필요하다.
    SalesContractPricesModule,
  ],
  controllers: [
    StylesController,
    ContractsController,
    OrderProcessStagesController,
    OrderShipmentsController,
    OrderProgressSummaryController,
  ],
  providers: [
    StylesService,
    ContractsService,
    OrderProcessStagesService,
    OrderShipmentsService,
    OrderProgressSummaryService,
  ],
})
export class StylesModule {}
