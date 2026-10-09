import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ExchangeRateType } from '../entities/customs-exchange-rate.entity';

export class CreateCustomsExchangeRateDto {
  @ApiProperty({ enum: ExchangeRateType, description: '수출/수입 구분' })
  @IsEnum(ExchangeRateType)
  rateType: ExchangeRateType;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2026-10-11' })
  @IsDateString()
  validTo: string;

  // 0 이하는 "계산 불가"를 조용히 만들어내므로(PR-157과 같은 이유) 양수만 받는다.
  @ApiProperty({ example: 1387.5 })
  @IsNumber()
  @IsPositive()
  rate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
