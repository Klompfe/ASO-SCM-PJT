import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateOrderShipmentDto {
  @ApiPropertyOptional({ example: '2026-09-16' })
  @IsOptional()
  @IsDateString()
  plannedShipDate?: string;

  @ApiPropertyOptional({ description: '출고가 실제로 이뤄진 날짜 — 입력하면 "완료" 상태가 된다', example: '2026-09-16' })
  @IsOptional()
  @IsDateString()
  actualShipDate?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ example: '2차로 정정' })
  @IsOptional()
  @IsString()
  remark?: string;
}
