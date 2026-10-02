import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesContractPriceRow } from './entities/sales-contract-price-row.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { SalesContractPricesService } from './sales-contract-prices.service';
import { SalesContractPricesController } from './sales-contract-prices.controller';
import { BrandPrefixRulesModule } from '../brand-prefix-rules/brand-prefix-rules.module';

@Module({
  imports: [TypeOrmModule.forFeature([SalesContractPriceRow, MasterStyle]), BrandPrefixRulesModule],
  controllers: [SalesContractPricesController],
  providers: [SalesContractPricesService],
  exports: [SalesContractPricesService],
})
export class SalesContractPricesModule {}
