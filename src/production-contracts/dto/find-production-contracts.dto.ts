import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { OptionalPaginationQueryDto } from '../../common/dto/optional-pagination-query.dto';

export class FindProductionContractsDto extends OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '계약일 From(포함)', example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '계약일 To(포함)', example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: '스타일번호/제조사명 부분일치 검색어(대소문자 무시)', example: 'MB6' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
