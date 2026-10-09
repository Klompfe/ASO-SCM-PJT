import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { OptionalPaginationQueryDto } from '../../common/dto/optional-pagination-query.dto';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class GetPurchaseOrdersFilterDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({
    description: '발주 상태 필터',
    enum: PurchaseOrderStatus,
  })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ description: '원자재 품목 ID 필터' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  itemId?: number;

  @ApiPropertyOptional({ description: '공급업체 ID 필터' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierId?: number;

  @ApiPropertyOptional({ description: '품목명/품목코드/공급업체명 부분일치 검색어(대소문자 무시)', example: '원단' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '조회 시작일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '조회 종료일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  // PR-185: 두 트랙 필터 — STYLE(스타일 연결, styleNo IS NOT NULL) / ITEM_ONLY(스타일 미연결, styleNo IS NULL).
  @ApiPropertyOptional({ description: '스타일 연결 여부 필터', enum: ['STYLE', 'ITEM_ONLY'] })
  @IsOptional()
  @IsEnum(['STYLE', 'ITEM_ONLY'])
  track?: 'STYLE' | 'ITEM_ONLY';

  @ApiPropertyOptional({ description: '연결된 스타일번호 필터(정확히 일치)' })
  @IsOptional()
  @IsString()
  styleNo?: string;
}