import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { MasterStyle } from './master-style.entity';

export enum StyleOverviewStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
}

@Entity()
export class StyleOverview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  factory: string;

  @Column('decimal')
  totalQty: number;

  @Column()
  buyer: string;

  // 원본 엑셀에서 미입력(빈칸)인 경우가 대부분이라 nullable로 둔다 (section-parser.util.ts 주석 참고).
  @Column({ nullable: true })
  firstShipDate: Date | null;

  @Column({
    type: 'simple-enum',
    enum: StyleOverviewStatus,
    default: StyleOverviewStatus.PENDING_APPROVAL,
  })
  status: StyleOverviewStatus;

  @OneToOne(() => MasterStyle, (style) => style.overview)
  style: MasterStyle;
}
