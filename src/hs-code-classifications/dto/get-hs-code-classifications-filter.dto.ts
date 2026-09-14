import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GetHsCodeClassificationsFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '품종 검색(부분일치)' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ description: '재직 검색(부분일치)' })
  @IsOptional()
  @IsString()
  fabricType?: string;

  @ApiPropertyOptional({ description: '혼용률 검색(부분일치)' })
  @IsOptional()
  @IsString()
  composition?: string;

  @ApiPropertyOptional({ description: '연결된 스타일번호 검색(부분일치)' })
  @IsOptional()
  @IsString()
  styleNo?: string;
}
