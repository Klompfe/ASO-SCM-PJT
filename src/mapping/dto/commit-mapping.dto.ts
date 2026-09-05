import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProductionType } from '../../styles/entities/style-overview.entity';

export class CommitOverviewDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ example: '베트남' })
  @IsNotEmpty()
  @IsString()
  factory: string;

  @ApiProperty({ example: 700 })
  @IsNumber()
  totalQty: number;

  @ApiProperty({ example: '미도컴퍼니' })
  @IsNotEmpty()
  @IsString()
  buyer: string;

  // 원본 엑셀에서 미입력(빈칸)인 경우가 대부분이라 optional로 둔다.
  @ApiPropertyOptional({ description: '1st Ship Date', example: '' })
  @IsOptional()
  @IsString()
  shipDate?: string;

  // 아래 6개는 PR-054에서 추가 — 작업지시서 AI 분석(오더개요) 경로에서만 채워진다.
  // Excel 매핑 커밋 경로는 이 필드들을 보내지 않으므로 계속 null로 남는다(기존 동작 유지).
  @ApiPropertyOptional({ example: '울혼방 코튼 반소매재킷' })
  @IsOptional()
  @IsString()
  styleName?: string;

  @ApiPropertyOptional({ example: '미센스' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'JK' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ enum: ProductionType })
  @IsOptional()
  @IsEnum(ProductionType)
  productionType?: ProductionType;

  @ApiPropertyOptional({ description: '납기(목표출고일)', example: '2026-09-12' })
  @IsOptional()
  @IsString()
  targetRdd?: string;
}

export class CommitBomItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'POLY BAG' })
  @IsNotEmpty()
  @IsString()
  itemName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  consumption?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  requiredQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  colorOf?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  colorCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CommitMappingDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ type: CommitOverviewDto })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => CommitOverviewDto)
  overviewData: CommitOverviewDto;

  @ApiProperty({ type: [CommitBomItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitBomItemDto)
  bomItems: CommitBomItemDto[];
}
