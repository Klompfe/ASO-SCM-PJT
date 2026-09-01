import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum ImportStatus {
  SUCCESS = 'SUCCESS',
  MISMATCH = 'MISMATCH',
  FAILED = 'FAILED',
}

@Entity()
export class ImportFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fileName: string;

  @Column()
  styleNo: string;

  @CreateDateColumn()
  importedAt: Date;

  @Column({
    type: 'simple-enum',
    enum: ImportStatus,
    default: ImportStatus.SUCCESS,
  })
  status: ImportStatus;
}
