import { IsEnum, IsNotEmpty } from 'class-validator';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class UpdatePurchaseOrderStatusDto {
  @IsNotEmpty()
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;
}