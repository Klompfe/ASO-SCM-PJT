import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

// PR-124: 선적 일정/경로 수정. 값을 지우려면 null(또는 빈 문자열)을 보낸다 — 보내지 않은 필드는 그대로 둔다.
export class UpdateImportShipmentHeaderDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() pol?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() pod?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '2026-07-19' }) @IsOptional() @IsDateString() etd?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '2026-07-24' }) @IsOptional() @IsDateString() eta?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() vessel?: string | null;
}
