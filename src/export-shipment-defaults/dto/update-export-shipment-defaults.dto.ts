import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateExportShipmentDefaultsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipperInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consigneeInfo?: string;

  @ApiPropertyOptional({ example: 'INCHEON, KOREA' })
  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @ApiPropertyOptional({ example: 'HAIPHONG, VIETNAM' })
  @IsOptional()
  @IsString()
  finalDestination?: string;

  @ApiPropertyOptional({ example: 'DONGJIN CONTINENTAL / 0217W' })
  @IsOptional()
  @IsString()
  carrier?: string;
}
