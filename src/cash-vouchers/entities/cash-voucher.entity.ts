import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Buyer } from '../../buyers/entities/buyer.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { ProductionContract } from '../../production-contracts/entities/production-contract.entity';
import { User } from '../../users/entities/user.entity';

export enum CashVoucherType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

// PR-094: 회계관리 그룹의 첫 모듈 — 입출금전표(현금·계좌 입출금 기록). 경비/급여/
// 부가세관리(다음 PR들)가 이 구조를 참고/재사용할 수 있도록, 거래처는 Buyer/Supplier
// 마스터로 FK 강제하지 않고 자유입력(counterpartyName)을 기본으로 하되 마스터에 있는
// 경우에만 선택적으로 연결한다(입출금은 마스터에 없는 상대방과도 흔히 발생하므로).
@Entity('cash_vouchers')
export class CashVoucher {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', enum: CashVoucherType })
  voucherType: CashVoucherType;

  @Column({ type: 'date' })
  voucherDate: Date;

  @Column({ type: 'decimal' })
  amount: number;

  @Column()
  counterpartyName: string;

  @Column({ nullable: true })
  counterpartyBuyerId: number | null;

  @ManyToOne(() => Buyer, { nullable: true })
  @JoinColumn({ name: 'counterpartyBuyerId' })
  counterpartyBuyer: Buyer | null;

  @Column({ nullable: true })
  counterpartySupplierId: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'counterpartySupplierId' })
  counterpartySupplier: Supplier | null;

  // 정식 계좌 마스터는 이번 범위 아님 — 자유입력(예: "국민은행 태일무역", "현금").
  @Column()
  account: string;

  // 정식 카테고리 마스터도 이번 범위 아님(다음 PR인 경비관리와 함께 정리 예정).
  @Column()
  category: string;

  @Column({ nullable: true })
  relatedPurchaseOrderId: number | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'relatedPurchaseOrderId' })
  relatedPurchaseOrder: PurchaseOrder | null;

  @Column({ nullable: true })
  relatedProductionContractId: number | null;

  @ManyToOne(() => ProductionContract, { nullable: true })
  @JoinColumn({ name: 'relatedProductionContractId' })
  relatedProductionContract: ProductionContract | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column()
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
