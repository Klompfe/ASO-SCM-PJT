import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, ValidateNested } from 'class-validator';

// PR-196: 미연결 발주 정리 — 단건 스타일 연결(PATCH /purchase-orders/:id/style-link).
export class LinkPurchaseOrderStyleDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsString()
  styleNo: string;
}

export class PurchaseOrderStyleLinkEntryDto {
  @ApiProperty({ example: 101 })
  @IsInt()
  poId: number;

  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsString()
  styleNo: string;
}

// PR-196: 일괄 확정(POST /purchase-orders/style-link/bulk) — all-or-nothing, 최대 100건.
export class BulkLinkPurchaseOrderStyleDto {
  @ApiProperty({ type: [PurchaseOrderStyleLinkEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderStyleLinkEntryDto)
  links: PurchaseOrderStyleLinkEntryDto[];
}
