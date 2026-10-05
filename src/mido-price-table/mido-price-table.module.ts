import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MidoPriceItem } from './entities/mido-price-item.entity';
import { MidoPriceTableService } from './mido-price-table.service';
import { MidoPriceTableController } from './mido-price-table.controller';
import { MaterialPackagingUnitRulesModule } from '../material-packaging-unit-rules/material-packaging-unit-rules.module';

// PR-182: 실/테이프 미터단가 → 콘/롤단가 환산에 material-packaging-unit-rules(PR-175)의
// 단위길이 룩업을 쓴다.
@Module({
  imports: [TypeOrmModule.forFeature([MidoPriceItem]), MaterialPackagingUnitRulesModule],
  controllers: [MidoPriceTableController],
  providers: [MidoPriceTableService],
  exports: [MidoPriceTableService],
})
export class MidoPriceTableModule {}
