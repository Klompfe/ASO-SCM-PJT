import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandPrefixRule } from './entities/brand-prefix-rule.entity';
import { BrandPrefixRulesService } from './brand-prefix-rules.service';
import { BrandPrefixRulesController } from './brand-prefix-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BrandPrefixRule])],
  controllers: [BrandPrefixRulesController],
  providers: [BrandPrefixRulesService],
  exports: [BrandPrefixRulesService, TypeOrmModule],
})
export class BrandPrefixRulesModule {}
