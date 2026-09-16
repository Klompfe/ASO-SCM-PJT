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

  // PR-101: itemType은 자유 텍스트가 아니라 카테고리성 값(예: JK/BL/OP/SL)이라
  // styleNo와 달리 부분일치가 아닌 정확히 일치로 필터링한다.
  @ApiPropertyOptional({ description: '품목(itemType) 정확히 일치', example: 'JK' })
  @IsOptional()
  @IsString()
  itemType?: string;
}
