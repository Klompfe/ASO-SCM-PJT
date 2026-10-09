import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandPriceRule } from './entities/brand-price-rule.entity';
import { BrandPriceRulesService } from './brand-price-rules.service';
import { BrandPriceRulesController } from './brand-price-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BrandPriceRule])],
  controllers: [BrandPriceRulesController],
  providers: [BrandPriceRulesService],
  exports: [BrandPriceRulesService, TypeOrmModule],
})
export class BrandPriceRulesModule {}
