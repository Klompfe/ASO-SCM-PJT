import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { MasterStyle } from './master-style.entity';

export enum StyleOverviewStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
}

export enum ProductionType {
  FOB = 'FOB',
  CMT = 'CMT',
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

  // 아래 6개 컬럼은 PR-046에서 추가됐다. Excel 매핑 커밋(mapping-commit.service.ts)은
  // 이 값들을 채우지 않으므로 그 경로로 생성된 레코드는 전부 null이다 — 수동 등록
  // (master-style.controller.ts POST)에서만 채워진다.
  @Column({ nullable: true })
  brand: string | null;

  @Column({ nullable: true })
  itemType: string | null;

  @Column({ type: 'varchar', enum: ProductionType, nullable: true })
  productionType: ProductionType | null;

  @Column({ type: 'date', nullable: true })
  targetRdd: Date | null;

  @Column({ type: 'decimal', nullable: true })
  cmtPrice: number | null;

  @Column({ type: 'decimal', nullable: true })
  fobPrice: number | null;

  @OneToOne(() => MasterStyle, (style) => style.overview)
  style: MasterStyle;
}
