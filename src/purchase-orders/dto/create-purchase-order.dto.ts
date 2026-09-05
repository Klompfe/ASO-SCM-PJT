import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: '공급업체 ID', example: 1 })
  @IsInt()
  supplierId: number;

  @ApiProperty({ description: '품목 ID', example: 1 })
  @IsInt()
  itemId: number;

  @ApiProperty({ description: '주문 수량', example: 100 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: '품목 단가', example: 12.5 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ description: '비고/설명', example: '1분기 원자재 발주', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}