import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-111: 스타일번호 접두사 → 브랜드 매핑 마스터. 접두사 체계가 앞으로도 늘거나
// 바뀔 수 있어(사용자 확인) 하드코딩하지 않고 화면에서 추가/수정 가능한 데이터로
// 관리한다. 숫자로 시작하는 스타일(예: 에잇세컨즈)은 prefix가 없으므로
// isNumericStart로 별도 구분한다.
@Entity('brand_prefix_rules')
export class BrandPrefixRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  prefix?: string | null;

  @Column({ default: false })
  isNumericStart: boolean;

  // PR-165: 숫자로 시작하는 브랜드가 둘 이상(에잇세컨즈/뮤트)일 수 있어, 그중 더
  // 구체적인 패턴을 가진 규칙을 구분하는 정규식 문자열(예: '^\\d{2}[FS]'). 비어
  // 있으면(null) "숫자로 시작하면 다 이 브랜드"인 기존의 catch-all 규칙이다.
  @Column({ nullable: true })
  numericPattern?: string | null;

  @Column()
  brandName: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  // PR-188: 이 브랜드가 미도 단가표(mido_price_items)를 참고단가로 쓰는지 — 'MIDO'면
  // 적용 대상, null이면 미적용(단가표 후보를 아예 보여주지 않는다). 뮤트 전용가
  // (brand_price_rules)와는 별개 체계라 이 값과 무관하게 계속 동작한다.
  @Column({ nullable: true })
  priceTableCode?: string | null;

  // PR-188: 이 브랜드의 수출서류(INVOICE) 원단(FABRIC) 라인 단위 기본값 — 지정돼
  // 있으면 자재마스터 Item.unit보다 우선한다(빈폴/에잇세컨즈는 'M'). null이면 기존
  // 동작 그대로(Item.unit 우선, 없으면 'YD').
  @Column({ nullable: true })
  fabricLineUnit?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
