import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PackingMaterialCategory } from '../entities/packing-receipt.entity';

export class CreatePackingReceiptRollDto {
  @ApiProperty({ example: '1' })
  @IsNotEmpty()
  @IsString()
  rollNo: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 133 })
  @IsOptional()
  @IsNumber()
  widthCm?: number;

  @ApiPropertyOptional({ example: 52.36 })
  @IsOptional()
  @IsNumber()
  widthInch?: number;

  @ApiPropertyOptional({ example: 83 })
  @IsOptional()
  @IsNumber()
  grossWeight?: number;

  @ApiPropertyOptional({ example: 83 })
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  @ApiPropertyOptional({ example: 22.7 })
  @IsOptional()
  @IsNumber()
  thickness?: number;

  @ApiPropertyOptional({ example: 143, description: 'PR-157: 실제 롤 길이(야드) — 공급업체 패킹리스트 값을 그대로 입력' })
  @IsOptional()
  @IsNumber()
  lengthYd?: number;
}

export class CreatePackingReceiptCartonDto {
  @ApiProperty({ example: 'T.I-274' })
  @IsNotEmpty()
  @IsString()
  cartonNo: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: '15MM' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: 'LOT-001' })
  @IsOptional()
  @IsString()
  lotNo?: string;

  @ApiProperty({ example: 250 })
  @IsNumber()
  qty: number;

  @ApiPropertyOptional({ example: '메인라벨' })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  weightKg?: number;
}

export class CreatePackingReceiptDto {
  @ApiProperty({ enum: PackingMaterialCategory })
  @IsEnum(PackingMaterialCategory)
  materialCategory: PackingMaterialCategory;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ example: 12.5, description: 'PR-157: 공급업체 제공 CBM(수동 입력) — 없는 업체는 비워둠' })
  @IsOptional()
  @IsNumber()
  cbm?: number;

  @ApiPropertyOptional({ type: [CreatePackingReceiptRollDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackingReceiptRollDto)
  rolls?: CreatePackingReceiptRollDto[];

  @ApiPropertyOptional({ type: [CreatePackingReceiptCartonDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackingReceiptCartonDto)
  cartons?: CreatePackingReceiptCartonDto[];
}
