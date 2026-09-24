import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLog } from './entities/ai-usage-log.entity';

// Gemini 3.6 Flash 공식 단가(2026-12-31까지, https://ai.google.dev/gemini-api/docs/pricing).
// 2027-01-01부터 2배로 오르므로 그 시점에 재산정 필요.
const INPUT_USD_PER_MILLION_TOKENS = 0.75;
const OUTPUT_USD_PER_MILLION_TOKENS = 3.75; // 사고(thinking) 토큰 포함

@Injectable()
export class AiUsageLogService {
  constructor(
    @InjectRepository(AiUsageLog)
    private readonly usageLogRepository: Repository<AiUsageLog>,
  ) {}

  // 실측 데이터(6페이지/799KB, 16페이지/2.3MB 문서) 기준 원가 대비 약 7~15배 마진으로
  // 설계한 페이지 수 기준 과금표. 표 B(파일 크기 기준)로 바꾸려면 이 메서드만 교체하면 된다.
  calculateCharge(pageCount: number): number {
    if (pageCount <= 5) return 500;
    if (pageCount <= 15) return 1000;
    if (pageCount <= 30) return 2000;
    return 2000 + (pageCount - 30) * 50;
  }

  private estimateCostUsd(promptTokens: number, outputTokens: number): number {
    return (
      (promptTokens / 1_000_000) * INPUT_USD_PER_MILLION_TOKENS +
      (outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION_TOKENS
    );
  }

  async log(userId: number, pageCount: number, promptTokens: number, outputTokens: number): Promise<AiUsageLog> {
    const usageLog = this.usageLogRepository.create({
      userId,
      pageCount,
      promptTokens,
      outputTokens,
      estimatedCostUsd: this.estimateCostUsd(promptTokens, outputTokens),
      chargedAmountKrw: this.calculateCharge(pageCount),
    });
    return this.usageLogRepository.save(usageLog);
  }

  async findByUser(userId: number): Promise<AiUsageLog[]> {
    return this.usageLogRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async getSummaryByUser(userId: number): Promise<{ totalCalls: number; totalChargedKrw: number; totalCostUsd: number }> {
    const logs = await this.findByUser(userId);
    return {
      totalCalls: logs.length,
      totalChargedKrw: logs.reduce((sum, l) => sum + l.chargedAmountKrw, 0),
      totalCostUsd: logs.reduce((sum, l) => sum + Number(l.estimatedCostUsd), 0),
    };
  }
}
