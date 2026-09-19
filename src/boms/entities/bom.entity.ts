import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { BomItem } from './bom-item.entity';

@Entity('bom_master')
export class Bom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bomNo: string;

  @Column()
  version: string;

  // PR-121: 한 스타일에 Bom이 여러 건일 때 실제로 쓸 BOM 표시. 마이그레이션이 스타일별 최고 id만
  // true로 남겨 기존 동작(최신=가장 큰 id)을 그대로 보존하고, 이후 "BOM 중복 검토" 화면에서 바꾼다.
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => MasterStyle, (style) => style.boms)
  style: MasterStyle;

  @OneToMany(() => BomItem, (bomItem) => bomItem.bom)
  items: BomItem[];
}
