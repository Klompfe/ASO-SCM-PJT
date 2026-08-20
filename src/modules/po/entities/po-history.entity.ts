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

  @Column({ name: 'po_header_id', type: 'uuid' })
  poHeaderId: string;

  @ManyToOne(() => POHeaderEntity, (header) => header.histories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'po_header_id' })
  poHeader: POHeaderEntity;

  // 🛠️ SQLite 호환성을 위해 'enum' -> 'simple-enum'으로 변경
  @Column({
    name: 'from_status',
    type: 'simple-enum',
    enum: POStatus,
    nullable: true,
  })
  fromStatus: POStatus;

  // 🛠️ SQLite 호환성을 위해 'enum' -> 'simple-enum'으로 변경
  @Column({
    name: 'to_status',
    type: 'simple-enum',
    enum: POStatus,
  })
  toStatus: POStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}