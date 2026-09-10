import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ProcessStageName } from '../entities/order-process-stage.entity';

export class UpsertProcessStageDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ enum: ProcessStageName })
  @IsEnum(ProcessStageName)
  stage: ProcessStageName;

  @ApiPropertyOptional({ example: '2026-09-08' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @IsDateString()
  finishDate?: string;

  @ApiPropertyOptional({ example: 1357 })
  @IsOptional()
  @IsNumber()
  targetQty?: number;

  @ApiPropertyOptional({ example: 900 })
  @IsOptional()
  @IsNumber()
  completedQty?: number;

  @ApiPropertyOptional({ example: 'Line A' })
  @IsOptional()
  @IsString()
  lineOrTeam?: string;
}
