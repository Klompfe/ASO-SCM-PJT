import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';

export class GetPurchaseOrdersFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '발주 상태 필터',
    enum: PurchaseOrderStatus,
  })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

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