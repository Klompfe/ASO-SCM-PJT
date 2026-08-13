import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { WorkOrderStatus } from '../entities/work-order-status.enum';

export class UpdateWorkOrderDto {
  @ApiPropertyOptional({ description: '지시 수량', example: 15 })
  @IsOptional()
  @IsNumber({}, { message: 'quantity는 숫자 형태여야 합니다.' })
  @IsPositive({ message: 'quantity는 0보다 큰 양수여야 합니다.' })
  quantity?: number;

  @ApiPropertyOptional({
    description: '작업 지시서 상태',
    enum: WorkOrderStatus,
    example: WorkOrderStatus.IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(WorkOrderStatus, { message: '올바른 WorkOrderStatus 값이 아닙니다.' })
  status?: WorkOrderStatus;
}