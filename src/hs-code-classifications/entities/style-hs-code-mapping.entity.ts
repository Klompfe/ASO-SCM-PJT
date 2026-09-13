import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { HsCodeClassification } from './hs-code-classification.entity';

// PR-081: 스타일번호 -> HS코드 분류 매핑. 같은 스타일번호가 다시 임포트되면
// 최신 값으로 덮어쓴다(styleNo unique) — 원본 엑셀에 실제로 16건의 중복
// Style No가 존재함을 확인했다(파일 뒤쪽 행이 최신 검토본이라는 전제로 마지막
// 값이 최종 반영된다).
@Entity('style_hs_code_mappings')
export class StyleHsCodeMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  styleNo: string;

  @Column()
  classificationId: number;

  @ManyToOne(() => HsCodeClassification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classificationId' })
  classification: HsCodeClassification;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
