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
}
