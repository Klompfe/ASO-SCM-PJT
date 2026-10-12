import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// PR-188: 단가 값은 소수 6자리까지만 허용(실제 등록 예정 데이터 — 0.00012 같은 미터당
// 실 단가가 있어 class-validator의 @IsNumber maxDecimalPlaces로 맞춘다).
export class CreateMidoPriceItemDto {
  @ApiProperty({ description: '단가표 항목명(중복 불가)', example: '겉감(WOOL 60~70%)' })
  @IsNotEmpty()
  @IsString()
  itemName: string;

  @ApiProperty({ description: '최소 단가(USD)', example: 2.5 })
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  priceUsdMin: number;

  @ApiProperty({ description: '최대 단가(USD) — 범위가 없으면 priceUsdMin과 동일', example: 3 })
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  priceUsdMax: number;

  @ApiProperty({ description: '단가 단위', example: 'YD' })
  @IsNotEmpty()
  @IsString()
  unit: string;

  @ApiPropertyOptional({ description: '비고' })
  @IsOptional()
  @IsString()
  note?: string;
}
