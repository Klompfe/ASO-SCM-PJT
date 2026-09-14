import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// suppliers(PR-037)와 동일한 CRUD 마스터 패턴이다(PR-069). StyleOverview.buyer/
// Contract.buyer는 여전히 자유입력 문자열로 남겨둔다 — Contract는 "등록 시점
// 스냅샷" 원칙(PR-066)이라 FK로 바꾸는 게 그 설계와 맞지 않고, 이번 PR은
// 순수하게 고객사 마스터 CRUD 화면만 만드는 것으로 범위를 제한했다.
@Entity('buyers')
export class Buyer {
  @PrimaryGeneratedColumn()
  id: number;

  // PR-085: 사람이 직접 입력하던 값에서 서버 자동채번("TY-{브랜드약칭}-{YY}{일련번호4자리}",
  // 예: TY-MB-260001)으로 바뀌었다 — unique 제약은 그대로 유지(포맷만 바뀜, 기존 로우는
  // 구 포맷 그대로 둔다). BuyersService.create() 참고.
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  // PR-085: 고객사명만으로도 등록 가능하도록 필수에서 완화.
  @Column({ nullable: true })
  contactPerson?: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  address?: string;

  // PR-085: 채번에 실제로 쓰인 브랜드 약칭(입력값이든 고객사명에서 자동추출한 값이든)을
  // 저장해둔다 — 같은 브랜드로 추가 등록할 때 참고할 수 있게.
  @Column({ nullable: true })
  brandCode?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
