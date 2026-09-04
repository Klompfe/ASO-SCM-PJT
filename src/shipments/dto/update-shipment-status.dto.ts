import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ShipmentStatus } from '../entities/shipment.entity';

export class UpdateShipmentStatusDto {
  @ApiProperty({
    description: '변경할 출하 상태',
    enum: ShipmentStatus,
    example: ShipmentStatus.DELIVERED,
  })
  @IsNotEmpty()
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;
}
