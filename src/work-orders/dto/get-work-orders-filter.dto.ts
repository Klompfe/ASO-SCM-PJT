import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsNumber, IsOptional, IsString } from 'class-validator';
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

  // PR-159: 2단계(스타일 클릭 후 세부 목록)에서 "스타일 미지정"(item.styleNo가 null인)
  // 그룹을 펼쳤을 때 그 건들만 조회하기 위함 — 기존 styleNo(LIKE 부분일치)로는 "값이
  // 없음"을 표현할 방법이 없어 별도 플래그로 추가했다. true면 styleNo 조건을 무시하고
  // item.styleNo IS NULL만 적용한다.
  @ApiPropertyOptional({ description: 'true면 item.styleNo가 null인 작업지시만 조회("스타일 미지정" 그룹)', example: 'true' })
  @IsOptional()
  @IsBooleanString()
  noStyleNo?: string;

  // PR-159: 2단계 세부 목록은 1단계 집계가 "정확한" styleNo로 묶은 그룹을 그대로 펼치는
  // 것이라, 기존 styleNo(부분일치 LIKE)를 쓰면 그 문자열을 포함하는 다른 스타일까지
  // 함께 섞여 나올 수 있다(예: "AB1"로 펼쳤는데 "AB123"도 걸림). 그래서 완전일치 전용
  // 필드를 별도로 둔다 — styleNo(부분일치)와 동시에 오면 이 값이 우선한다.
  @ApiPropertyOptional({ description: '스타일번호 완전일치(2단계 세부 목록 전용) — styleNo(부분일치)보다 우선', example: 'MB62SLM103Z' })
  @IsOptional()
  @IsString()
  styleNoExact?: string;

  @ApiPropertyOptional({ description: '조회 시작일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '조회 종료일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}