import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-175: 실/테이프 등 자재 종류별 "포장단위"(콘/롤 등) 환산 기준을 하드코딩
// 상수(thread-cone-price.util.ts의 THREAD_CONE_LENGTH_M, PR-157)에서 DB 테이블로
// 옮긴다 — brand-prefix-rules.module.ts(PR-111)와 동일한 설계 원칙("앞으로 늘거나
// 바뀔 수 있는 규칙은 하드코딩하지 않는다")을 그대로 따른다. materialSubType은
// BomItem.threadType/tapeType enum 값과 동일한 문자열을 키로 써서(예: 'COA_SA',
// 'DADE') 두 컬럼 모두 이 하나의 테이블로 조회할 수 있게 한다.
@Entity('material_packaging_unit_rules')
export class MaterialPackagingUnitRule {
  @PrimaryGeneratedColumn()
  id: number;

  // BomItem.threadType/tapeType enum 값과 동일한 문자열(예: 'COA_SA', 'DADE').
  @Column({ unique: true })
  materialSubType: string;

  // 화면 표시용 한글명(예: '코아사', '다데').
  @Column()
  displayName: string;

  // 포장단위 명칭(예: '콘', '롤').
  @Column()
  packagingUnitLabel: string;

  // 포장단위 하나(콘/롤 등)당 길이(미터).
  @Column({ type: 'decimal' })
  unitLengthM: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
