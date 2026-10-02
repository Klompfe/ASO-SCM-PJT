import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// PR-166: SALES CONTRACT 통합본(예: 26FW_통합_SALES_CONTRACT.xlsx) 업로드 원본을
// 그대로 저장한다. CMT매입단가 표준가격(sales-contract-prices.service.ts의
// resolveCmtPrice)이 이 테이블을 근거로 (1)스타일번호 정확매칭 (2)브랜드×품종
// 평균 (3)그래도 없으면 수동 확인 대기 순으로 단가를 찾는다. brand는 저장 시점에
// classifyBrand()(브랜드 접두사 마스터)로 미리 분류해 둔다 — 조회마다 다시 계산하지
// 않기 위함이며, 분류 규칙이 나중에 바뀌면 재임포트로 다시 채워진다.
@Entity('sales_contract_price_rows')
export class SalesContractPriceRow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  // classifyBrand() 결과 — 어떤 접두사 규칙에도 안 걸리면 null(미분류).
  @Column({ nullable: true })
  brand: string | null;

  // 원본 파일의 "Description"(예: "WOMEN'S PANTS") — 공란인 행도 있다(원본 데이터 특성).
  @Column({ nullable: true })
  category: string | null;

  @Column({ type: 'decimal', nullable: true })
  quantity: number | null;

  @Column()
  unit: string;

  @Column({ type: 'decimal' })
  unitPrice: number;

  @Column({ type: 'decimal', nullable: true })
  amount: number | null;

  // 통합본 파일 안에서도 원래 각 건별 계약서 파일명이 "Source File" 칸에 남아있다
  // (예: 26FW_0825_SALES_CONTRACT_전달용_.xlsx) — 근거 추적용으로 그대로 보존한다.
  @Column({ nullable: true })
  sourceFile: string | null;

  // 어느 업로드(재임포트)로 들어온 행인지 구분 — 한 파일을 통째로 다시 올리면
  // importBatch가 바뀌면서 이전 배치 행은 전부 지워진다(아래 서비스 참고).
  @Column()
  importBatch: string;

  @CreateDateColumn()
  createdAt: Date;
}
