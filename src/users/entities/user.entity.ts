import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// PR-153: 4단계 역할 구조로 재설계(PR-151의 ADMIN/USER/MANAGER/OPERATOR/VIEWER를 대체).
// 데이터 마이그레이션(1790341000000-RemapUserRoles.ts)이 기존 저장값을 이 표대로 변환한다:
//   ADMIN(최상위) -> MASTER, MANAGER(섹션 승인권) -> ADMIN, USER(기본값) -> STAFF.
// "새 ADMIN"은 "기존 ADMIN"과 같은 문자열이 아니라 한 단계 아래(구 MANAGER)를 가리키므로
// 혼동 주의. OPERATOR/VIEWER는 이번 구조에 대응 개념이 없어 제거한다(STAFF가 입력/조회/출력을
// 포괄) — 전역 ReadOnlyGuard(auth/guards/read-only.guard.ts)도 VIEWER 전용이라 함께 제거됨.
export enum UserRole {
  MASTER = 'MASTER',
  ADMIN = 'ADMIN',
  ACCOUNTING = 'ACCOUNTING',
  STAFF = 'STAFF',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: false })
  username: string;

  @Column({ unique: true, nullable: true })
  email: string;

  // PR-071: password(bcrypt 해시)는 로그인 검증에만 필요하고 클라이언트로 나가는
  // 응답에는 절대 포함되면 안 된다. select:false로 기본 조회(find/findOne)에서
  // 자동으로 제외하고, 로그인 등 실제로 필요한 곳에서만 QueryBuilder의
  // addSelect('user.password')로 명시적으로 가져온다.
  @Column({ nullable: false, select: false })
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({
    type: 'varchar',
    enum: UserRole,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  // PR-151: 멀티테넌트 스캐폴딩 — 구조만 미리 만들어두고 강제 필터링은 하지 않는다
  // (지금은 태일무역 한 회사만 쓰고 있다). nullable이라 기존 사용자는 전부 null로
  // 남고, 다른 엔티티에 tenant 필터를 걸지도 않는다 — 실제로 두 번째 고객사가 생기면
  // 그때 본격적인 격리 PR로 이어간다(이 판단은 사용자 확인 완료, 2026-09-25).
  // PR-153: companyId가 있으면 그 회사 소속 MASTER, 없으면(현재 태일무역 단일 사용
  // 상태) 개인/전체 MASTER로 해석한다 — 별도 컬럼 신설 없이 이 컬럼을 그대로 재사용.
  @Column({ nullable: true })
  companyId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}