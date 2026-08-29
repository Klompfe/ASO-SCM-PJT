import { Entity, PrimaryColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ProductionType {
  FOB = 'FOB',
  CMT = 'CMT',
}

@Entity('styles')
export class Style {
  @PrimaryColumn()
  styleNo: string;

  @Column()
  brand: string;

  @Column()
  itemType: string;

  @Column({ type: 'enum', enum: ProductionType })
  productionType: ProductionType;

  @Column({ type: 'date' })
  targetRdd: Date;

  @Column({ type: 'int' })
  totalQty: number;

  @Column({ default: 'PLANNED' })
  status: string;

  @Column({ type: 'decimal', nullable: true })
  cmtPrice: number;

  @Column({ type: 'decimal', nullable: true })
  fobPrice: number;

  @OneToMany(() => StyleMaterial, (sm) => sm.style)
  materials: StyleMaterial[];

  @OneToMany(() => StyleLogistics, (sl) => sl.style)
  logistics: StyleLogistics[];

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('style_materials')
export class StyleMaterial {
  @PrimaryColumn()
  id: string; // StyleNo + MaterialId

  @Column()
  vendor: string;

  @Column({ nullable: true })
  poDate: Date;

  @Column({ nullable: true })
  factoryInDate: Date;

  @Column({ nullable: true })
  productionInputDate: Date;

  @Column()
  styleNo: string;
  
  @ManyToOne(() => Style, (s) => s.materials)
  style: Style;
}

@Entity('style_logistics')
export class StyleLogistics {
  @PrimaryColumn()
  styleNo: string;

  @Column({ nullable: true })
  completionDate: Date;

  @Column({ nullable: true })
  exportDate: Date;

  @Column({ nullable: true })
  importDate: Date;

  @Column({ nullable: true })
  finalDeliveryDate: Date;

  @OneToOne(() => Style)
  @JoinColumn({ name: 'styleNo' })
  style: Style;
}
import { ManyToOne, OneToOne, JoinColumn } from 'typeorm';
