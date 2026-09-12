import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Item } from '../items/entities/item.entity';
import { PackingReceipt } from './entities/packing-receipt.entity';
import { PackingReceiptRoll } from './entities/packing-receipt-roll.entity';
import { PackingReceiptCarton } from './entities/packing-receipt-carton.entity';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PackingReceiptsService } from './packing-receipts.service';
import { PackingReceiptsController } from './packing-receipts.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, Item, PackingReceipt, PackingReceiptRoll, PackingReceiptCarton]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
  ],
  controllers: [PurchaseOrdersController, PackingReceiptsController],
  providers: [PurchaseOrdersService, PackingReceiptsService],
})
export class PurchaseOrdersModule {}