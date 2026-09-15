import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn()
  id: number;

  // PR-088: 사람이 직접 입력하던 값에서 서버 자동채번("TY-{업체약칭}-{YY}{일련번호4자리}",
  // 예: TY-GM-260001)으로 바뀌었다(Buyer, PR-085와 동일 패턴) — unique 제약은 그대로
  // 유지(포맷만 바뀜, 기존 로우는 구 포맷 그대로 둔다). SuppliersService.create() 참고.
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ name: 'business_number', nullable: true })
  businessNumber?: string;

  @Column({ name: 'contact_phone', nullable: true })
  contactPhone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  // PR-088: 채번에 실제로 쓰인 업체약칭(입력값이든 업체명에서 자동추출한 값이든)을
  // 저장해둔다 — 같은 업체로 추가 등록할 때 참고할 수 있게(Buyer.brandCode와 동일 목적).
  @Column({ nullable: true })
  abbrCode?: string;

  @OneToMany(() => PurchaseOrder, (po) => po.supplier)
  purchaseOrders?: PurchaseOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
