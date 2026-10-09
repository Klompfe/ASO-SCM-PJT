import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateBrandPriceRuleDto {
  @ApiProperty({ example: '뮤트' })
  @IsNotEmpty()
  @IsString()
  brandName: string;

  @ApiProperty({ example: '겉감' })
  @IsNotEmpty()
  @IsString()
  categoryKeyword: string;

  @ApiProperty({ example: 1.0 })
  @IsNumber()
  @IsPositive()
  priceUsd: number;

  @ApiProperty({ example: 'YD' })
  @IsNotEmpty()
  @IsString()
  unit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
