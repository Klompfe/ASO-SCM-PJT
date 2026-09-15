import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ProductionContractPriceSource } from '../entities/production-contract.entity';

export class CreateProductionContractDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ description: '제조사(Supplier) id — 태일비나도 일반 Supplier로 등록해 참조', example: 1 })
  @IsInt()
  manufacturerId: number;

  @ApiProperty({ enum: ProductionContractPriceSource, example: ProductionContractPriceSource.PRE_AGREED })
  @IsEnum(ProductionContractPriceSource)
  priceSource: ProductionContractPriceSource;

  // priceSource=PRE_AGREED면 필수(서비스단에서 검증), CMT_INVOICE면 아예 보내면 안 된다.
  @ApiPropertyOptional({ description: 'PRE_AGREED일 때만 필요 — 생성 시점 값을 그대로 스냅샷 저장', example: 12.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  cmtPrice?: number;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  contractDate: string;

  @ApiPropertyOptional({ example: '1차 생산계약' })
  @IsOptional()
  @IsString()
  note?: string;
}
