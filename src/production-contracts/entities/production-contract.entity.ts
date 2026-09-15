import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Supplier } from '../../suppliers/entities/supplier.entity';

export enum ProductionContractPriceSource {
  PRE_AGREED = 'PRE_AGREED',
  CMT_INVOICE = 'CMT_INVOICE',
}

export enum ProductionContractPriceStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING_CMT_INVOICE = 'PENDING_CMT_INVOICE',
}

// PR-093: 태일무역(한국) — 태일비나(베트남 생산법인) 간 생산계약(Sales Contract).
// 단가 확정 경로가 두 가지다:
//  1단계(PRE_AGREED) — 고객사 계약 체결 시점에 이미 정해진 단가를 그대로 스냅샷
//  저장한다. 이 흐름은 이번 PR에서 전부 구현한다.
//  2단계(CMT_INVOICE) — 자재발주/선적 시점엔 단가를 모르고, 완제품이 한국으로
//  수입될 때 태일비나가 제공하는 INV/PKL의 "IV CMT" 시트 단가로 사후 확정된다.
//  이번 PR은 그 "IV CMT 시트 파싱" 로직은 만들지 않는다(실제 샘플 파일 확보 후
//  별도 PR) — 다만 cmtPrice를 null로 남겨두고 priceStatus를
//  PENDING_CMT_INVOICE로 시작하게 해서, 나중에 그 값을 채우고 상태를 CONFIRMED로
//  바꾸는 로직만 이어붙이면 되도록 구조를 미리 만들어둔다.
@Entity('production_contracts')
export class ProductionContract {
  @PrimaryGeneratedColumn()
  id: number;

  // 기존 고객사향 Contract/StyleOverview와 동일하게 문자열 참조로만 둔다(FK 강제 안 함).
  @Column()
  styleNo: string;

  // 태일비나도 별도 "제조사" 타입 구분 없이 일반 Supplier 레코드로 등록해서 참조한다.
  @Column()
  manufacturerId: number;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'manufacturerId' })
  manufacturer: Supplier;

  @Column({ type: 'varchar', enum: ProductionContractPriceSource })
  priceSource: ProductionContractPriceSource;

  // priceSource가 PRE_AGREED면 생성 시점 값을 그대로 스냅샷 저장(고객사향
  // Contract.cmtPrice와 동일 패턴 — 이후 다른 값이 바뀌어도 재계산하지 않음).
  // CMT_INVOICE면 생성 시점엔 반드시 null(2단계에서 채워질 자리).
  @Column({ type: 'decimal', nullable: true })
  cmtPrice: number | null;

  @Column({
    type: 'varchar',
    enum: ProductionContractPriceStatus,
  })
  priceStatus: ProductionContractPriceStatus;

  @Column({ type: 'decimal' })
  quantity: number;

  @Column({ type: 'date' })
  contractDate: Date;

  @Column({ nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
