import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { WorkOrderStatus } from '../entities/work-order.entity';

export class GetWorkOrdersFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '작업지시 상태 필터', enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

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