import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ExportShipmentStatus } from '../entities/export-shipment.entity';

export class UpdateExportShipmentStatusDto {
  @ApiProperty({ enum: ExportShipmentStatus })
  @IsEnum(ExportShipmentStatus)
  status: ExportShipmentStatus;
}
