import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// PR-127: 거래처(Buyer) "검색 선택"용. 고객사명/코드/브랜드약칭 부분일치(대소문자 무시) — 공급업체(PR-126)와 같은 패턴.
export class GetBuyersFilterDto {
  @ApiPropertyOptional({ description: '고객사명/코드/브랜드약칭 부분일치 검색어', example: 'Myung' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
