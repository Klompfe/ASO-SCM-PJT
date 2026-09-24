import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

// 프로세스가 뜬 시각(모듈 로드 시점)을 한 번만 기록해, 요청마다 바뀌지 않는 "이 배포가 언제부터 떠 있었는지" 값으로 쓴다.
const deployedAt = new Date().toISOString();

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      // Render가 배포 시 자동 주입하는 커밋 SHA. /health 하나로 "지금 배포된 코드가 어느 커밋인지" 바로 확인하기 위함(PR-137).
      commit: process.env.RENDER_GIT_COMMIT || 'unknown',
      deployedAt,
    };
  }
}
