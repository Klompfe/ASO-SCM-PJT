import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StyleFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() rddStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() rddEnd?: string;
}
