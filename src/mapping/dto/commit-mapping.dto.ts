import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

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
