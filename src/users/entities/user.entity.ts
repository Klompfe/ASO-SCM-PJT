import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// PR-151: OPERATOR/VIEWER 추가. 기존 ADMIN/USER/MANAGER 값은 절대 지우거나 이름을
// 바꾸지 않는다 — DB에 이미 저장된 role 컬럼 값(문자열)과 기존 15곳의 @Roles() 사이트가
// 그 문자열 그대로에 의존한다(role 컬럼 자체가 varchar라 새 값 추가는 스키마 변경이 없다).
// OPERATOR: 이미지 업로드/파싱 데이터 수동 검수 등 실무 데이터 입력 담당.
// VIEWER: 조회만 가능 — 개별 @Roles()가 아니라 전역 ReadOnlyGuard가 모든 쓰기 요청을 막는다
// (auth/guards/read-only.guard.ts 참고, 기존 @Roles() 사이트와는 독립적으로 적용됨).
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
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
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  // PR-151: 멀티테넌트 스캐폴딩 — 구조만 미리 만들어두고 강제 필터링은 하지 않는다
  // (지금은 태일무역 한 회사만 쓰고 있다). nullable이라 기존 사용자는 전부 null로
  // 남고, 다른 엔티티에 tenant 필터를 걸지도 않는다 — 실제로 두 번째 고객사가 생기면
  // 그때 본격적인 격리 PR로 이어간다(이 판단은 사용자 확인 완료, 2026-09-25).
  @Column({ nullable: true })
  companyId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}