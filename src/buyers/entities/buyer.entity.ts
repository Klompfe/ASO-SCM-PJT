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

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  contactPerson: string;

  @Column()
  contactPhone: string;

  @Column({ nullable: true })
  email?: string;

  @Column()
  country: string;

  @Column({ nullable: true })
  address?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
