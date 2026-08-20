import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { WorkOrderStatus } from '../entities/work-order.entity';

export class GetWorkOrdersFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '작업지시 상태 필터', enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ description: '생산 완제품 ID 필터' })
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