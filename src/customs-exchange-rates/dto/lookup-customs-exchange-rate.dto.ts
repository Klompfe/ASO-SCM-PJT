import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ExchangeRateType } from '../entities/customs-exchange-rate.entity';

export class LookupCustomsExchangeRateDto {
  @ApiProperty({ enum: ExchangeRateType })
  @IsEnum(ExchangeRateType)
  rateType: ExchangeRateType;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: '2026-10-07' })
  @IsDateString()
  date: string;
}

export class GetCustomsExchangeRateStatusDto {
  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  // 생략하면 한국 시간(Asia/Seoul) 기준 오늘.
  @ApiPropertyOptional({ example: '2026-10-07' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
