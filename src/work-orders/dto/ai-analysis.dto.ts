import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ProductionType } from '../../styles/entities/style-overview.entity';

// 작업지시서 한 건(=오더개요) 정보. AI 분석은 문서에서 읽지 못한 값은 null로 둔다.
export class AiOverviewDto {
  @ApiPropertyOptional() @IsOptional() @IsString() styleNo: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() styleName: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() itemType: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() brand: string | null;
  @ApiPropertyOptional({ enum: ProductionType }) @IsOptional() @IsEnum(ProductionType) productionType: ProductionType | null;
  @ApiPropertyOptional() @IsOptional() @IsString() factory: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() buyer: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalQty: number | null;
  @ApiPropertyOptional({ description: '납기(YYYY-MM-DD)' }) @IsOptional() @IsString() targetRdd: string | null;
}

export class AiBomItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category: string | null;
  @ApiProperty() @IsNotEmpty() @IsString() itemName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spec: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() colorCode: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() consumption: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() requiredQty: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks: string | null;
}

// 사이즈 스펙표 한 행 (부위 x 사이즈). 원본이 손글씨 분수 표기라 문자열로 둔다.
export class AiSizeSpecRowDto {
  @ApiProperty() @IsNotEmpty() @IsString() part: string;
  @ApiProperty() @IsNotEmpty() @IsString() size: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instructedValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() sampleValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() diffValue: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() finalValue: string | null;
}

// 작업지시서 한 페이지(=스타일 하나) 분석 결과. AI 응답 형태이자 최종저장 요청 바디로도 쓰인다.
export class AiWorkOrderResultDto {
  @ApiProperty({ type: AiOverviewDto })
  @ValidateNested()
  @Type(() => AiOverviewDto)
  overview: AiOverviewDto;

  @ApiProperty({ type: [AiBomItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiBomItemDto)
  bomItems: AiBomItemDto[];

  @ApiProperty({ type: [AiSizeSpecRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiSizeSpecRowDto)
  sizeSpecs: AiSizeSpecRowDto[];

  @ApiPropertyOptional({ description: '손글씨 봉제/후가공 지시사항 등 구조화하기 어려운 메모' })
  @IsOptional()
  @IsString()
  workNotes: string | null;
}
