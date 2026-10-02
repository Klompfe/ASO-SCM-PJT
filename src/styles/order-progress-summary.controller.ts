import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderProgressSummaryService } from './order-progress-summary.service';

// 읽기 전용 리포트라 role 제한 없음(PR-067 지시사항) — 전역 JwtAuthGuard로
// 로그인 여부만 확인하면 충분하다.
@ApiTags('오더 진행현황 요약')
@ApiBearerAuth()
@Controller('order-progress-summary')
export class OrderProgressSummaryController {
  constructor(private readonly summaryService: OrderProgressSummaryService) {}

  // PR-167: factory를 생략하면(기본 동작) 전부 보여준다 — "숨기지 않는다"는
  // 요구사항대로, 기본값 좁히기는 프론트가 쿼리를 "태일"로 채워 보내는 방식으로 한다.
  @Get()
  @ApiQuery({ name: 'factory', required: false, example: '태일' })
  getSummary(@Query('factory') factory?: string) {
    return this.summaryService.getSummary(factory);
  }
}
