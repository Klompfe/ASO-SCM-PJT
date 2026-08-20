import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { POHistoryEntity } from './po-history.entity';

export enum POStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  ISSUED = 'ISSUED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity('po_headers')
export class POHeaderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'po_number', unique: true, type: 'varchar', length: 50 })
  poNumber: string;

  @Column({ name: 'vendor_name', type: 'varchar', length: 255 })
  vendorName: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 2 })
  totalAmount: number;

  // 🛠️ SQLite 호환성을 위해 'enum' -> 'simple-enum'으로 변경
  @Column({ type: 'simple-enum', enum: POStatus, default: POStatus.DRAFT })
  status: POStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => POHistoryEntity, (history) => history.poHeader, { cascade: true })
  histories: POHistoryEntity[];
}