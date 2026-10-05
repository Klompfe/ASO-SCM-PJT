import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { Item } from '../../items/entities/item.entity';

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

  // PR-171: 이 업체가 주로 취급하는 품목(주요품목) — 발주/BOM을 거치지 않고도
  // 참고용으로 바로 확인할 수 있게 다대다로 직접 연결한다. 조인 테이블 이름/컬럼명을
  // 명시해 마이그레이션(수기 SQL)이 TypeORM 기본 네이밍에 의존하지 않도록 한다.
  @ManyToMany(() => Item)
  @JoinTable({
    name: 'supplier_main_items',
    joinColumn: { name: 'supplierId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'itemId', referencedColumnName: 'id' },
  })
  mainItems?: Item[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
