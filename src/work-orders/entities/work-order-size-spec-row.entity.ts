import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { WorkOrderSpec } from './work-order-spec.entity';

// 원본 문서의 값이 "32½", "23¾"처럼 분수 표기가 섞여 있어 숫자가 아니라 문자열로 보관한다.
@Entity()
export class WorkOrderSizeSpecRow {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => WorkOrderSpec, (spec) => spec.sizeSpecs)
  spec: WorkOrderSpec;

  @Column()
  part: string; // 부위 (예: 화장, 총기장, 품, 밑단넓이)

  @Column()
  size: string; // 사이즈 (예: 0, 1, 2, Free)

  @Column({ nullable: true })
  instructedValue: string | null; // 지시서

  @Column({ nullable: true })
  sampleValue: string | null; // 견본

  @Column({ nullable: true })
  diffValue: string | null; // 증감

  @Column({ nullable: true })
  finalValue: string | null; // 완성
}
