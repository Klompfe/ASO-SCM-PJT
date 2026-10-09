import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomsExchangeRate } from './entities/customs-exchange-rate.entity';
import { CustomsExchangeRatesService } from './customs-exchange-rates.service';
import { CustomsExchangeRatesController } from './customs-exchange-rates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomsExchangeRate])],
  controllers: [CustomsExchangeRatesController],
  providers: [CustomsExchangeRatesService],
  exports: [CustomsExchangeRatesService, TypeOrmModule],
})
export class CustomsExchangeRatesModule {}
