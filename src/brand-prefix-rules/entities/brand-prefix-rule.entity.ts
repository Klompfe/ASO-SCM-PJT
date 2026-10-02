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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
