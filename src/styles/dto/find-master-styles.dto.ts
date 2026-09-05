import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class FindMasterStylesDto {
  @ApiPropertyOptional({ description: '스타일 번호 부분 일치 검색' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  @ApiPropertyOptional({ description: '목표출고일(targetRdd) 범위 시작' })
  @IsOptional()
  @IsDateString()
  targetRddFrom?: string;

  @ApiPropertyOptional({ description: '목표출고일(targetRdd) 범위 끝' })
  @IsOptional()
  @IsDateString()
  targetRddTo?: string;
}
