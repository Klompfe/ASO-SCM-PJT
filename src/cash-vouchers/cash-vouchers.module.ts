import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashVoucher } from './entities/cash-voucher.entity';
import { CashVouchersService } from './cash-vouchers.service';
import { CashVouchersController } from './cash-vouchers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CashVoucher])],
  controllers: [CashVouchersController],
  providers: [CashVouchersService],
  exports: [CashVouchersService],
})
export class CashVouchersModule {}
