import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class FindExportPerformanceDto {
  @ApiPropertyOptional({ description: 'INVOICE 일자 From(포함)', example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'INVOICE 일자 To(포함)', example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
