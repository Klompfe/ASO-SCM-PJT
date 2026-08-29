import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum MasterStatus {
  ACTIVE = 'ACTIVE',
  NEW_MASTER_CANDIDATE = 'NEW_MASTER_CANDIDATE',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  UNKNOWN_MASTER = 'UNKNOWN_MASTER',
}

@Entity('master_styles')
export class Style {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  styleNo: string;

  @Column()
  season: string;

  @Column()
  year: number;

  @Column({ type: 'date', nullable: true })
  rddDate: Date;
}

@Entity('master_materials')
export class Material {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  itemCode: string;

  @Column()
  itemName: string;

  @Column()
  category: string; // 원단/부자재

  @Column({ default: MasterStatus.ACTIVE })
  status: MasterStatus;
}

@Entity('master_vendors')
export class Vendor {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  vendorCode: string;

  @Column()
  vendorName: string;
}

@Entity('master_buyers')
export class Buyer {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  buyerCode: string;

  @Column()
  buyerName: string;
}

@Entity('master_colors')
export class Color {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  colorCode: string;
}

@Entity('master_sizes')
export class Size {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  sizeCode: string;
}
