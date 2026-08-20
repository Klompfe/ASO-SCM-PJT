import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';
import { PoStatus } from '../../purchase-orders/entities/purchase-order.entity'; // 👈 상대 경로 수정

export class GetPurchaseOrdersFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '발주 상태 필터', enum: PoStatus })
  @IsOptional()
  @IsEnum(PoStatus)
  status?: PoStatus;

  @ApiPropertyOptional({ description: '품목 ID 필터' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  itemId?: number;

  @ApiPropertyOptional({ description: '조회 시작일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '조회 종료일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}