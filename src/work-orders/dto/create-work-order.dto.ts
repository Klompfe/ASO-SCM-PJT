import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { WorkOrderStatus } from '../entities/work-order-status.enum';

export class CreateWorkOrderDto {
  // 입력 검증 타입을 string으로 명시적 통일
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsNotEmpty()
  @IsString()
  itemId: string;

  @IsNotEmpty()
  @IsNumber()
  targetQuantity: number;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;
}