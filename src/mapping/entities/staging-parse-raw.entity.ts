import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class StagingParseRaw {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fileName: string;

  @Column({ type: 'text', nullable: true })
  raw_header_json: string;

  @Column({ type: 'text', nullable: true })
  raw_bom_json: string;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @CreateDateColumn()
  createdAt: Date;
}
