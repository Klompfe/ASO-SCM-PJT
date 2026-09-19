import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class FindProductionContractsDto {
  @ApiPropertyOptional({ description: '계약일 From(포함)', example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '계약일 To(포함)', example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
