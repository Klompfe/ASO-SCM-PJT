import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
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

  // PR-185: 스타일 연결/해제/변경. null을 보내면 연결을 해제(미연결로)한다. undefined(미전송)면 건드리지 않는다.
  // 값을 보내면 create()와 같은 검증(스타일 존재, 최신 BOM에 이 발주의 itemId 자재 포함)을 거친다.
  @ApiPropertyOptional({ description: '스타일 연결 변경(선택) — null이면 연결 해제', example: 'MB62SLM103Z', nullable: true })
  @IsOptional()
  @IsString()
  styleNo?: string | null;

  @ApiPropertyOptional({ description: '단가표 참고단가(USD, 선택)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  referenceUnitPriceUsd?: number;

  @ApiPropertyOptional({ enum: ['BRAND_RULE', 'MIDO_TABLE', 'MANUAL'] })
  @IsOptional()
  @IsEnum(['BRAND_RULE', 'MIDO_TABLE', 'MANUAL'])
  referencePriceSource?: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL';

  @ApiPropertyOptional({ description: '참고단가 선택 근거/환산식(선택)' })
  @IsOptional()
  @IsString()
  referencePriceNote?: string;
}
