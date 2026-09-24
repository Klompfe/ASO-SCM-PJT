import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GetWorkOrdersFilterDto extends PaginationQueryDto {
  // PR-140: 상태값이 status-codes 마스터 테이블(관리자가 추가 가능) 기준으로 바뀌어 컴파일
  // 시점의 고정 enum으로는 검증할 수 없다 — 존재하지 않는 코드로 필터링해도 결과가 0건일
  // 뿐 해가 없으므로(읽기 경로) 문자열만 받고 값 자체는 검증하지 않는다.
  @ApiPropertyOptional({ description: '작업지시 상태 필터(status-codes의 code 값)', example: 'IN_PROGRESS' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '생산 완제품 ID 필터' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  itemId?: number;

  @ApiPropertyOptional({ description: '완제품 품목명/품목코드/스타일번호 부분일치 검색어(대소문자 무시)', example: 'MB6' })
  @IsOptional()
  @IsString()
  keyword?: string;

  // PR-139: 목록 화면에서 품목명/품목코드/스타일번호를 각각 독립된 입력란으로 검색할 수 있도록 keyword와 별개로 추가.
  // keyword는 기존 검색 선택(SearchSelectField 등, searchFetchers.ts의 searchWorkOrders)이 계속 쓰므로 그대로 둔다.
  @ApiPropertyOptional({ description: '완제품 품목명 부분일치 검색어(대소문자 무시)', example: '셔츠' })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional({ description: '완제품 품목코드 부분일치 검색어(대소문자 무시)', example: 'MB6' })
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiPropertyOptional({ description: '완제품 스타일번호 부분일치 검색어(대소문자 무시)', example: 'MB62SLM103Z' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  @ApiPropertyOptional({ description: '조회 시작일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '조회 종료일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}