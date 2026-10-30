import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { MasterStyle } from './master-style.entity';

export enum QuantityMarket {
  DOMESTIC = 'DOMESTIC',
  CHINA = 'CHINA',
  UNKNOWN = 'UNKNOWN',
}

export enum QuantitySource {
  MATERIAL_LIST = 'MATERIAL_LIST',
  MANUAL = 'MANUAL',
  AI = 'AI',
}

// PR-212: 스타일의 생산수량을 색상×사이즈 단위로 저장한다. market은 확장용(이번 PR은
// DOMESTIC만 쓴다, 중국 수량은 사용자 결정으로 저장하지 않음). color/size는 원문 그대로
// (대문자 변환·번역 없이) 저장한다 — mapping/utils/style-color-size-quantity-parser.util.ts 참고.
@Entity('style_color_size_quantities')
@Unique(['styleNo', 'color', 'size', 'market'])
@Index(['styleNo'])
export class StyleColorSizeQuantity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @ManyToOne(() => MasterStyle)
  @JoinColumn({ name: 'styleNo', referencedColumnName: 'styleNo' })
  style: MasterStyle;

  @Column()
  color: string;

  @Column()
  size: string;

  @Column({ type: 'varchar', enum: QuantityMarket, default: QuantityMarket.DOMESTIC })
  market: QuantityMarket;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'varchar', enum: QuantitySource, default: QuantitySource.MATERIAL_LIST })
  source: QuantitySource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
