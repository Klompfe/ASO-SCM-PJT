import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum ExceptionCode {
  UNKNOWN_MATERIAL = 'UNKNOWN_MATERIAL',
  UNKNOWN_COLOR = 'UNKNOWN_COLOR',
  UNKNOWN_SIZE = 'UNKNOWN_SIZE',
  UNKNOWN_UNIT = 'UNKNOWN_UNIT',
  MAPPING_CONFLICT = 'MAPPING_CONFLICT',
  INVALID_QUANTITY = 'INVALID_QUANTITY',
  INVALID_FORMULA = 'INVALID_FORMULA',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  AMBIGUOUS_MAPPING = 'AMBIGUOUS_MAPPING',
  MASTER_NOT_FOUND = 'MASTER_NOT_FOUND',
}

@Entity('mapping_exception_logs')
export class ExceptionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batchId: number;

  @Column()
  sourceRowId: number;

  @Column()
  exceptionCode: ExceptionCode;

  @Column()
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
