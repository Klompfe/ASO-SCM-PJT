import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderProgressSummaryService } from './order-progress-summary.service';

// 읽기 전용 리포트라 role 제한 없음(PR-067 지시사항) — 전역 JwtAuthGuard로
// 로그인 여부만 확인하면 충분하다.
@ApiTags('오더 진행현황 요약')
@ApiBearerAuth()
@Controller('order-progress-summary')
export class OrderProgressSummaryController {
  constructor(private readonly summaryService: OrderProgressSummaryService) {}

  @Get()
  getSummary() {
    return this.summaryService.getSummary();
  }
}
