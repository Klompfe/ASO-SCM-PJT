import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PurchaseOrderType } from '../entities/purchase-order.entity';

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

  // PR-180: 실발주(FIRM)/가발주(PROVISIONAL). 화면이 제안값을 보여주고 사람이 확정해 보낸다 — 서버는 추측해서 채우지 않는다.
  @ApiProperty({ enum: PurchaseOrderType, required: false, description: '발주 구분(실발주/가발주)' })
  @IsEnum(PurchaseOrderType)
  @IsOptional()
  orderType?: PurchaseOrderType;

  @ApiProperty({ description: '비고/설명', example: '1분기 원자재 발주', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}