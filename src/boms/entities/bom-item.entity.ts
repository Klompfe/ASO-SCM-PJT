import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Bom } from './bom.entity';

@Entity()
export class BomItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bom, (bom) => bom.items)
  bom: Bom;

  // Assuming materialId comes from a separate MasterMaterial entity not defined here yet
  @Column()
  materialId: number;

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
