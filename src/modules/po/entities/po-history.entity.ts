import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { POHeaderEntity, POStatus } from './po-header.entity';

@Entity('po_histories')
export class POHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @Column({ name: 'from_status', type: 'enum', enum: POStatus })
  fromStatus: POStatus;

  @Column({ name: 'to_status', type: 'enum', enum: POStatus })
  toStatus: POStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => POHeaderEntity, (header) => header.histories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'po_id' })
  poHeader: POHeaderEntity;
}