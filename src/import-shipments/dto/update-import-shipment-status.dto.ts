import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ImportShipmentStatus } from '../entities/import-shipment.entity';

export class UpdateImportShipmentStatusDto {
  @ApiProperty({ enum: ImportShipmentStatus })
  @IsEnum(ImportShipmentStatus)
  status: ImportShipmentStatus;
}
