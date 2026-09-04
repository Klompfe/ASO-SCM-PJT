import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({ description: '출하 번호', example: 'SHIP-2026-001' })
  @IsNotEmpty({ message: '출하 번호는 필수입니다.' })
  @IsString()
  shipmentNumber: string;

  @ApiPropertyOptional({ description: '운송사명', example: 'DHL' })
  @IsOptional()
  @IsString()
  carrierName?: string;

  @ApiPropertyOptional({ description: '운송장 번호', example: '1234567890' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
