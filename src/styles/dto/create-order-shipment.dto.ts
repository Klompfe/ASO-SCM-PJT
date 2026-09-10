import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOrderShipmentDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ example: '2026-09-15' })
  @IsNotEmpty()
  @IsDateString()
  plannedShipDate: string;

  @ApiProperty({ example: 500 })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ example: '1차 부분출고' })
  @IsOptional()
  @IsString()
  remark?: string;
}
