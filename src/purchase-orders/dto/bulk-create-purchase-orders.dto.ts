import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';

// PR-179: 일괄발주 — 미리보기에서 사람이 확인한 행들을 한 번에 커밋한다(행마다 단건 생성과 같은 필드).
export class BulkCreatePurchaseOrdersDto {
  @ApiProperty({ type: [CreatePurchaseOrderDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderDto)
  orders: CreatePurchaseOrderDto[];
}
