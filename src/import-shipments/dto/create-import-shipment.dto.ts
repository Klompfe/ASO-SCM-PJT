import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateImportShipmentLineDto } from './create-import-shipment-line.dto';

export class CreateImportShipmentDto {
  @ApiProperty({ example: 'BF6X27C51' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiPropertyOptional({ example: 'TYVN2026-26' })
  @IsOptional()
  @IsString()
  invoiceNo?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiProperty({ type: [CreateImportShipmentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImportShipmentLineDto)
  lines: CreateImportShipmentLineDto[];
}
