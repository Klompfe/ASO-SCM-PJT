import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// PR-256: 겉감 혼용률 점검 목록 조회 조건(읽기 전용).
export class OuterFabricAuditQueryDto {
  @ApiPropertyOptional({ description: '상태 필터: all(전체 누락, 기본) / noRow(겉감 행 없음) / blank(겉감 혼용률 비어 있음) / noBom(BOM 없음)', enum: ['all', 'noRow', 'blank', 'noBom'] })
  @IsOptional()
  @IsIn(['all', 'noRow', 'blank', 'noBom'])
  status?: 'all' | 'noRow' | 'blank' | 'noBom';

  @ApiPropertyOptional({ description: '스타일 번호·이름 검색(부분일치, 대소문자 무시)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: '페이지 번호(기본 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '페이지당 건수(기본 50, 최대 200)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
