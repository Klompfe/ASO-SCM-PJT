import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// PR-126: 발주 화면의 공급업체 "검색 선택"용. 업체명/업체코드/약칭에 대한 부분일치(대소문자 무시).
export class GetSuppliersFilterDto {
  @ApiPropertyOptional({ description: '업체명/코드/약칭 부분일치 검색어', example: '태일' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
