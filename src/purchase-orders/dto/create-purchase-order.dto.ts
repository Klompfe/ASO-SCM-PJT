import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

// PR-176: 색상/사이즈별 상세 한 줄(자유 텍스트 색상/사이즈 + 수량).
export class PurchaseOrderLineDto {
  @ApiPropertyOptional({ example: 'BLACK' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: '공급업체 ID', example: 1 })
  @IsInt()
  supplierId: number;

  @ApiProperty({ description: '품목 ID', example: 1 })
  @IsInt()
  itemId: number;

  // PR-176: lines를 보내면 총수량은 라인 합계로 계산된다(이때 quantity를 같이 보내 다르면 경고).
  // lines가 없으면 기존처럼 quantity를 필수로 쓴다 — 서비스에서 검사한다.
  @ApiPropertyOptional({ description: '주문 수량(라인이 없으면 필수, 라인이 있으면 라인 합계가 우선)', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ description: '품목 단가', example: 12.5 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ description: '비고/설명', example: '1분기 원자재 발주', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [PurchaseOrderLineDto], description: '색상/사이즈별 상세(선택)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}
