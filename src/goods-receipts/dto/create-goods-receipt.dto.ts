import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateGoodsReceiptLineDto {
  @ApiProperty({ description: '입고증 라인으로 복사할 상세내역(ImportShipmentPackingDetail) ID', example: 1 })
  @IsInt()
  packingDetailId: number;

  // 미입력 시 상세내역의 원 수량(originalQty)을 그대로 쓴다 — 조정 없음.
  @ApiPropertyOptional({ description: '조정 수량(미입력 시 원 수량과 동일하게 처리)', example: 95 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  adjustedQty?: number;

  @ApiPropertyOptional({ description: '조정 사유(조정 수량이 원 수량과 다르면 필수)', example: '샘플 출고 5장 차감' })
  @IsOptional()
  @IsString()
  adjustmentReason?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: '수입통관 문서 ID', example: 1 })
  @IsInt()
  importShipmentId: number;

  @ApiPropertyOptional({ example: '1차 부분 입고' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({ type: [CreateGoodsReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  lines: CreateGoodsReceiptLineDto[];
}
