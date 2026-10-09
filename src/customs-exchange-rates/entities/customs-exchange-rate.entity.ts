import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-184: 관세청 주간환율(수출/수입) — 유니패스 크롤링/Open API 연동은 범위 밖(robots.txt
// 차단 확인됨, PR-157)이라 담당자가 매주 화면에서 직접 입력한다. 자동 확정하지 않는
// "참고/추천값" 원천 데이터다.
export enum ExchangeRateType {
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
}

@Entity('customs_exchange_rates')
export class CustomsExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', enum: ExchangeRateType })
  rateType: ExchangeRateType;

  @Column({ type: 'varchar', default: 'USD' })
  currency: string;

  // 적용 시작일/종료일(둘 다 포함) — 관세청 주간환율 고시 주기를 그대로 담는다.
  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date' })
  validTo: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  rate: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
