import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class UpdatePoStatusDto {
  @ApiProperty({
    description: '변경할 발주 상태',
    enum: PurchaseOrderStatus,
    example: PurchaseOrderStatus.RECEIVED,
  })
  @IsNotEmpty()
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;
}