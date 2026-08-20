import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { WorkOrderStatus } from '../entities/work-order.entity';

export class UpdateWorkOrderStatusDto {
  @ApiProperty({
    description: '변경할 작업지시 상태',
    enum: WorkOrderStatus,
    example: WorkOrderStatus.COMPLETED,
  })
  @IsNotEmpty()
  @IsEnum(WorkOrderStatus)
  status: WorkOrderStatus;
}