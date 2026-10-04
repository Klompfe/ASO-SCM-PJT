import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialPackagingUnitRule } from './entities/material-packaging-unit-rule.entity';
import { MaterialPackagingUnitRulesService } from './material-packaging-unit-rules.service';
import { MaterialPackagingUnitRulesController } from './material-packaging-unit-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MaterialPackagingUnitRule])],
  controllers: [MaterialPackagingUnitRulesController],
  providers: [MaterialPackagingUnitRulesService],
  exports: [MaterialPackagingUnitRulesService, TypeOrmModule],
})
export class MaterialPackagingUnitRulesModule {}
