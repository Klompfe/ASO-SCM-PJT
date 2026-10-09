import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-185: 브랜드 전용가 — 미도(CMT) 계약은 스타일이 아니라 브랜드별이라, 특정 브랜드+품목구분
// 조합에 단가표보다 우선하는 고정가를 둘 수 있게 한다(예: 뮤트 겉감 $1.00/YD). 이번 PR은
// 뮤트 3건만 시드하고(제시님 확정), 그 외 자재/브랜드는 미도 단가표를 그대로 따른다.
@Entity('brand_price_rules')
export class BrandPriceRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  brandName: string;

  // BomItem.category 또는 자재명에 이 키워드가 포함되는지로 매칭한다(예: '겉감', '안감', '행어').
  @Column()
  categoryKeyword: string;

  @Column({ type: 'decimal' })
  priceUsd: number;

  @Column()
  unit: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
