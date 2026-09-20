import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// PR-127: 기존 호출부(원장/리포트/전표 화면 등)가 "전량"을 기대하는 목록 API용. PaginationQueryDto는 page/limit 기본값(1/10)이
// 항상 채워져 파라미터를 안 보내도 10건으로 잘려 버리므로, 여기서는 기본값 없이 클라이언트가 page 또는 limit를 명시했을 때만
// 페이지네이션을 적용한다(둘 다 없으면 기존처럼 전량).
export const DEFAULT_OPTIONAL_PAGE_SIZE = 10;

export class OptionalPaginationQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호 (page 또는 limit를 주면 페이지네이션 적용, 둘 다 생략하면 전량)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '페이지당 항목 수 (최대 100, page만 주면 10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// page/limit가 하나도 없으면 null(=전량), 있으면 skip/take.
export function resolveOptionalPagination(
  filter?: Pick<OptionalPaginationQueryDto, 'page' | 'limit'>,
): { skip: number; take: number } | null {
  if (filter?.page === undefined && filter?.limit === undefined) return null;
  const page = filter.page ?? 1;
  const take = filter.limit ?? DEFAULT_OPTIONAL_PAGE_SIZE;
  return { skip: (page - 1) * take, take };
}
