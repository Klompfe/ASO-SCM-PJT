import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-183: 공급업체가 취급하는 "품목군"(겉감·안감·심지·실·테이프 …) — 세부 종류(코아사/오바사 등)는
// PR-175의 material_packaging_unit_rules와 BOM의 threadType/tapeType이 맡으므로 여기서 다루지 않는다.
// 기존 데이터 보존을 위해 새 테이블로만 추가한다(기존 supplier_main_items와 공존).
@Entity('material_categories')
export class MaterialCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
