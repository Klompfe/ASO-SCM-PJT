import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { PoStatus } from '../entities/purchase-order.entity';

export class UpdatePoStatusDto {
  @ApiProperty({
    description: '변경할 발주 상태',
    enum: PoStatus,
    example: PoStatus.RECEIVED,
  })
  @IsNotEmpty()
  @IsEnum(PoStatus)
  status: PoStatus;
}