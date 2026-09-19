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

  @Column()
  brandName: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
