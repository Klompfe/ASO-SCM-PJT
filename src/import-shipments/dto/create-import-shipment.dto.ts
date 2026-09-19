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

  @ApiPropertyOptional({ description: '선적항(POL)', example: 'HAIPHONG, VIETNAM' })
  @IsOptional()
  @IsString()
  pol?: string;

  @ApiPropertyOptional({ description: '최종 도착항(POD)', example: 'INCHEON , KOREA' })
  @IsOptional()
  @IsString()
  pod?: string;

  @ApiPropertyOptional({ description: '출항일(ETD)', example: '2026-07-19' })
  @IsOptional()
  @IsDateString()
  etd?: string;

  @ApiPropertyOptional({ description: '도착예정일(ETA) — 자동 파싱되지 않는 선택 입력', example: '2026-07-24' })
  @IsOptional()
  @IsDateString()
  eta?: string;

  @ApiPropertyOptional({ description: '선명', example: 'STARSHIP TAURUS 2613N' })
  @IsOptional()
  @IsString()
  vessel?: string;

  @ApiProperty({ type: [CreateImportShipmentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImportShipmentLineDto)
  lines: CreateImportShipmentLineDto[];
}
