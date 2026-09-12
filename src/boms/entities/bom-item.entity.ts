import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Bom } from './bom.entity';
import { Item } from '../../items/entities/item.entity';

@Entity('bom_item_details')
export class BomItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bom, (bom) => bom.items)
  bom: Bom;

  @ManyToOne(() => Item)
  material: Item;

  @Column()
  category: string; // 겉감, 안감 등

  @Column()
  colorCode: string;

  @Column()
  spec: string;

  @Column('decimal')
  consumption: number;

  @Column('decimal')
  requiredQty: number;

  @Column()
  supplier: string;

  @Column('decimal')
  unitPrice: number;

  @Column()
  remarks: string;

  // PR-073: 수출 선적서류(INVOICE/Packing List) 자동생성용. 혼용율(예: "WOOL 98%,
  // POLYURETHANE 2%")과 HS코드는 짝값이다(혼용율이 바뀌면 HS코드도 바뀐다) — 둘 다
  // 스타일마다 달라지는 값이라 자재마스터(Item)가 아니라 BomItem에 둔다. 기존 데이터
  // 호환을 위해 둘 다 nullable.
  @Column({ nullable: true })
  composition?: string;

  @Column({ nullable: true })
  hsCode?: string;
}
