import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProductionType, SalesMarket } from '../entities/style-overview.entity';

// PR-167: 빈폴/에잇세컨즈 계약은 승인 시점에 판매시장을 필수로 지정해야 한다
// (ContractsService.approve()가 검증). 그 외 브랜드는 담당자가 제안값(Buyer.
// defaultProductionType)을 그대로 쓰거나 다른 값으로 바꿔 보낼 수 있다 — 서버가
// 자동으로 확정하지 않고, 이 바디로 넘어온 값만 신뢰한다(안전모드).
export class ApproveContractDto {
  @ApiPropertyOptional({ enum: SalesMarket, example: SalesMarket.DOMESTIC })
  @IsOptional()
  @IsEnum(SalesMarket)
  salesMarket?: SalesMarket;

  @ApiPropertyOptional({ enum: ProductionType, example: ProductionType.CMT })
  @IsOptional()
  @IsEnum(ProductionType)
  productionType?: ProductionType;
}
