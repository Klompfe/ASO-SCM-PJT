import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 작업지시서 AI 분석(실제 Gemini 호출) 1건당 과금 로그. 페이지 수 기준 과금표
// (AiUsageLogService.calculateCharge) 적용 결과를 스냅샷으로 남긴다 — 표가 나중에
// 바뀌어도 과거 로그의 금액은 그대로 유지되어야 하므로 계산값을 저장하지 계산식을
// 저장하지 않는다. GEMINI_API_KEY 미설정 시의 목업 응답은 실제 비용이 없어 로그를
// 남기지 않는다(work-orders.service.ts 참고).
@Entity()
export class AiUsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  pageCount: number;

  @Column()
  promptTokens: number;

  @Column()
  outputTokens: number; // candidatesTokenCount + thoughtsTokenCount (둘 다 출력 단가로 과금됨)

  @Column('decimal')
  estimatedCostUsd: number;

  @Column()
  chargedAmountKrw: number;

  @CreateDateColumn()
  createdAt: Date;
}
