import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GetItemsFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '품목 유형 필터' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '검색 키워드 (이름/코드)' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
