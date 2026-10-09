import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Item } from '../items/entities/item.entity';
import { PackingReceipt } from './entities/packing-receipt.entity';
import { PackingReceiptRoll } from './entities/packing-receipt-roll.entity';
import { PackingReceiptCarton } from './entities/packing-receipt-carton.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PackingReceiptsService } from './packing-receipts.service';
import { PurchaseOrderDocumentService } from './purchase-order-document.service';
import { PackingReceiptsController } from './packing-receipts.controller';
import { PackingReceiptsReportController } from './packing-receipts-report.controller';
import { AuthModule } from '../auth/auth.module';
import { MidoPriceTableModule } from '../mido-price-table/mido-price-table.module';
import { BrandPriceRulesModule } from '../brand-price-rules/brand-price-rules.module';
import { BrandPrefixRulesModule } from '../brand-prefix-rules/brand-prefix-rules.module';
import { CustomsExchangeRatesModule } from '../customs-exchange-rates/customs-exchange-rates.module';
import { PriceReferenceService } from './price-reference.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PurchaseOrderLine, Item, PackingReceipt, PackingReceiptRoll, PackingReceiptCarton, BomItem]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    MidoPriceTableModule,
    BrandPriceRulesModule,
    BrandPrefixRulesModule,
    CustomsExchangeRatesModule,
  ],
  controllers: [PurchaseOrdersController, PackingReceiptsController, PackingReceiptsReportController],
  providers: [PurchaseOrdersService, PackingReceiptsService, PurchaseOrderDocumentService, PriceReferenceService],
})
export class PurchaseOrdersModule {}