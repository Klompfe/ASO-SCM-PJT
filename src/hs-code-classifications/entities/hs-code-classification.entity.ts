import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// PR-081: 완제품 수입통관 HS코드는 "품종(itemType) + 재직(fabricType) + 혼용률
// (composition)" 조합으로 결정된다 — 이 세 값의 조합이 실질적인 분류 키라
// unique 제약을 건다. fabricType은 원본 엑셀에 선행 공백 표기 차이가 있어(실질
// 값은 전부 동일) 저장 시 trim해 정규화한다(가져오기 로직에서 처리).
@Entity('hs_code_classifications')
@Unique(['itemType', 'fabricType', 'composition'])
export class HsCodeClassification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  itemType: string;

  @Column()
  fabricType: string;

  @Column()
  composition: string;

  @Column()
  hsCode: string;

  // 원본 "관,부가세 유무" 컬럼 — 자유 텍스트가 섞여 있어 구조화하지 않고 참고용
  // 원문 그대로 저장한다.
  @Column({ nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
