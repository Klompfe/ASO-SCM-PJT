import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
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

  // PR-181: 계약의 cmtPriceConfidence가 HANDWRITTEN_DRAFT(미도 수기 초안)이면 승인 시
  // 반드시 보내야 한다(초안과 같은 숫자여도 승인자가 명시적으로 확인해 보내야 함 —
  // ContractsService.approve()가 검증). 그 외 계약에는 영향 없다.
  @ApiPropertyOptional({ description: '수기 CMT단가 초안 승인 시 확정 금액', example: 7500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  cmtPrice?: number;

  @ApiPropertyOptional({ description: '승인자 코멘트 — 기존 cmtPriceNote 뒤에 이어 붙는다', example: '작지 원본 확인, 7,500으로 확정' })
  @IsOptional()
  @IsString()
  cmtPriceNote?: string;
}
