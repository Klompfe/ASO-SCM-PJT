import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('mapping_rules')
export class MappingRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rawKey: string;

  @Column()
  standardKey: string;

  @Column({ nullable: true })
  targetEntityId: number; // ID of the referenced Master entity (Item, Supplier, etc.)

  @Column()
  ruleType: string; // e.g., 'MATERIAL_MAP', 'SUPPLIER_MAP'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
