import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PurchaseOrderLineDto } from './create-purchase-order.dto';

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

  // MERGE-3(PR-176×177): 보내면 기존 줄을 전부 교체하고 quantity를 줄 합계로 다시
  // 계산한다(create()와 같은 규칙). 생략하면 줄은 건드리지 않는다.
  @ApiPropertyOptional({ type: [PurchaseOrderLineDto], description: '색상/사이즈별 상세(보내면 전체 교체)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}
