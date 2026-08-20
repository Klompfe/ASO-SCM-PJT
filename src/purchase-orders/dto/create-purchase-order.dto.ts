import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: '발주할 원자재 품목 ID', example: 1 })
  @IsNotEmpty()
  @IsNumber()
  itemId: number;

  @ApiProperty({ description: '발주 수량', example: 20 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  quantity: number;
}