import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ProductionType } from '../entities/style-overview.entity';

export class CreateMasterStyleDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ example: '베트남' })
  @IsNotEmpty()
  @IsString()
  factory: string;

  @ApiProperty({ example: '미도컴퍼니' })
  @IsNotEmpty()
  @IsString()
  buyer: string;

  @ApiProperty({ example: 700 })
  @IsNotEmpty()
  @IsNumber()
  totalQty: number;

  @ApiProperty({ example: 'ASO' })
  @IsNotEmpty()
  @IsString()
  brand: string;

  @ApiProperty({ example: 'TOP' })
  @IsNotEmpty()
  @IsString()
  itemType: string;

  @ApiProperty({ enum: ProductionType, example: ProductionType.FOB })
  @IsNotEmpty()
  @IsEnum(ProductionType)
  productionType: ProductionType;

  @ApiProperty({ example: '2026-12-01' })
  @IsNotEmpty()
  @IsDateString()
  targetRdd: string;

  @ApiPropertyOptional({ example: 5.5 })
  @IsOptional()
  @IsNumber()
  cmtPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  fobPrice?: number;
}
