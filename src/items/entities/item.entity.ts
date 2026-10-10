import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Inventory } from '../../inventories/entities/inventory.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/purchase-order.entity';
import { WorkOrder } from '../../work-orders/entities/work-order.entity';
import { ItemType } from './item-type.enum';
import { MaterialCategory } from '../../material-categories/entities/material-category.entity';

export { ItemType };

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  // PR-073: 수출 선적서류(INVOICE/Packing List) 자동생성용 — 카테고리 고정값이라
  // Item(자재마스터) 레벨에 둔다. 혼용율/HS코드는 스타일마다 달라지는 값이라
  // BomItem 쪽에 별도로 둔다(bom-item.entity.ts).
  @Column({ nullable: true })
  englishName?: string;

  @Column({
    type: 'varchar',
    default: ItemType.RAW_MATERIAL,
  })
  type: ItemType;

  // PR-078: 기존에는 컬럼 기본값이 'EA'였는데, items.service.ts의 create()도 항상
  // dto.unit || 'EA'로 값을 채워 넣고 있어 실질적으로 "값이 비어있는 품목"이 존재할
  // 수 없었다 — export-shipments.service.ts의 generate()가 Item.unit을 우선
  // 참조하고 "없으면" 기존 하드코딩(ROLL/EA)으로 폴백하려면, 진짜로 비어있는 상태
  // (null)가 가능해야 의미가 있다. 그래서 컬럼 기본값을 없앴다 — 기존 행의 저장된
  // 값은 그대로 유지되고(DROP DEFAULT는 신규 INSERT에만 영향), items.service.ts의
  // create()도 dto.unit이 없으면 더 이상 'EA'를 강제하지 않도록 함께 바꿨다.
  @Column({ nullable: true })
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

  // PR-183: 품목군(선택 입력). 기존 품목은 비어 있는 상태로 두고, 자동으로 추측해 채우지 않는다.
  @Column({ nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => MaterialCategory, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: MaterialCategory | null;

  // PR-186: 실/테이프 종류(material_packaging_unit_rules.materialSubType 값, 예: COA_SA) —
  // BOM 행(bom_item_details.threadType/tapeType)이 785건 전부 미지정인 운영 데이터 문제를
  // 자재 단위로 한 번만 지정해서 해결한다. BOM 행에 값이 있으면 그게 우선(effectiveSubType).
  @Column({ nullable: true })
  materialSubType?: string | null;

  // PR-186: 사람이 이 자재의 실/테이프 종류를 검토했다는 표시 — 종류를 지정했거나
  // "실/테이프 아님"으로 확정(materialSubType=null로 유지하면서 이 값만 채움)한 시각.
  // 값이 없으면 "아직 검토 안 함" — looksLikeThreadOrTape이면 경고만 내고 추측하지 않는다.
  // type을 명시하지 않아야 한다 — 'timestamp'는 sqlite(e2e 테스트 DB)에서 지원하지 않는
  // 타입이라 명시하면 DataTypeNotSupportedError로 서버가 뜨지 않는다. 타입 없이 두면
  // TypeORM이 TS 타입(Date)에서 드라이버별로 알맞은 컬럼 타입(Postgres timestamp without
  // time zone / sqlite datetime)을 추론한다.
  @Column({ nullable: true })
  packagingReviewedAt?: Date | null;

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