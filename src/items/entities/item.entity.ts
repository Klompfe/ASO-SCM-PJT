import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Inventory } from '../../inventories/entities/inventory.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { WorkOrder } from '../../work-orders/entities/work-order.entity';
import { ItemType } from './item-type.enum';

export { ItemType };

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    default: ItemType.RAW_MATERIAL,
  })
  type: ItemType;

  @Column({ default: 'EA', nullable: true })
  unit?: string;

  @Column({ nullable: true })
  spec?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  vendor?: string;

  @Column({ nullable: true })
  composition?: string;

  // FINISHED_GOOD 타입 Item이 속한 MasterStyle.styleNo. 모듈 간 순환 의존을 피하기 위해
  // 관계 대신 값만 저장하며, MasterStyle 조회는 서비스 레이어에서 styleNo로 별도 수행한다.
  @Column({ nullable: true })
  styleNo?: string;

  @OneToMany(() => Inventory, (inventory) => inventory.item)
  inventories?: Inventory[];

  @OneToMany(() => PurchaseOrder, (po) => po.item)
  purchaseOrders?: PurchaseOrder[];

  @OneToMany(() => WorkOrder, (wo) => wo.item)
  workOrders?: WorkOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}