import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class GetPriceReferenceDto {
  @ApiProperty({ description: '품목(자재) ID' })
  @Type(() => Number)
  @IsInt()
  itemId: number;

  @ApiPropertyOptional({ description: '스타일번호(연결 트랙) — 있으면 그 스타일의 브랜드/BOM 품목구분으로 매칭' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  @ApiPropertyOptional({ description: '브랜드명(스타일 미연결일 때 사람이 선택)' })
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional({ description: '발주/라인 단위(예: YD, CONE, ROLL) — 생략하면 품목(Item.unit)을 쓴다' })
  @IsOptional()
  @IsString()
  lineUnit?: string;

  @ApiPropertyOptional({ description: '실/테이프 종류(BomItem.threadType/tapeType)' })
  @IsOptional()
  @IsString()
  materialSubType?: string;
}
