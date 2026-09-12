import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  MANAGER = 'MANAGER',
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}