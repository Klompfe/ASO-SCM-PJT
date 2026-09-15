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

  // PR-098: 공급처는 작업지시서 문서 자체에는 없는 정보(실제 발주 단계에서 결정)라
  // "값이 없음"과 "N/A라는 문자열"을 구분해야 화면에서 정확히 "미정"으로 표시할 수
  // 있다 — nullable로 바꿔 mapping-commit.service.ts가 실제로 null을 저장하게 한다.
  @Column({ nullable: true })
  supplier: string | null;

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
