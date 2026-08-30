import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receiving } from './entities/transaction.entities';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { ReceivingService } from './services/receiving.service';
import { ReceivingController } from './receiving.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receiving, PurchaseOrder]),
  ],
  controllers: [ReceivingController],
  providers: [ReceivingService],
  exports: [ReceivingService],
})
export class TransactionModule {}
