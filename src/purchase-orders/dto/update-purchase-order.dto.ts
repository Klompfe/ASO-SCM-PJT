import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// PR-177: 미입고(PENDING) 발주의 수량/단가/비고 수정. 입고·취소된 발주는 서비스에서 막는다.
export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: '긴급 발주' })
  @IsOptional()
  @IsString()
  notes?: string;
}
