import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

// PR-194: 다품번 일괄발주 — 업체별 합본 발주서 생성(POST /purchase-orders/documents/combined).
export class CombinedPurchaseOrderDocumentDto {
  @ApiProperty({ type: [Number], example: [101, 102, 103] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  poIds: number[];
}
