import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ExchangeRateType } from '../entities/customs-exchange-rate.entity';

export class GetCustomsExchangeRatesFilterDto {
  @ApiPropertyOptional({ enum: ExchangeRateType })
  @IsOptional()
  @IsEnum(ExchangeRateType)
  rateType?: ExchangeRateType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
