import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 신규 사용자 회원가입
   */
  async register(authDto: any): Promise<any> {
    const { username, email, password } = authDto;
    const loginIdentifier = username || email;

    // 기존 사용자 중복 검사
    const existingUser = await this.userRepository.findOne({
      where: [{ username: loginIdentifier } as any, { email: loginIdentifier } as any],
    });
    if (existingUser) {
      throw new ConflictException('이미 존재하는 사용자입니다.');
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUserPayload: any = {
        username: loginIdentifier,
        email: email || loginIdentifier,
        password: hashedPassword,
      };

      const user = this.userRepository.create(newUserPayload as User);
      const savedUser: any = await this.userRepository.save(user as any);

      // 비밀번호 필드 제외 후 반환
      const { password: _, ...result } = Array.isArray(savedUser) ? savedUser[0] : savedUser;
      return result;
    } catch (error) {
      throw new InternalServerErrorException(
        '회원가입 처리 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 사용자 자격 증명 검증 (Local Strategy / Passport 호환용)
   */
  async validateUser(username: string, pass: string): Promise<any> {
    if (!username || !pass) {
      return null;
    }

    const user: any = await this.userRepository.findOne({
      where: [{ username } as any, { email: username } as any],
    });

    if (!user || !user.password) {
      return null;
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * 로그인 및 JWT 토큰 발급
   */
  async login(authDto: any): Promise<{ accessToken: string; user: any }> {
    const { username, email, password } = authDto;
    const loginIdentifier = username || email;

    const validatedUser = await this.validateUser(loginIdentifier, password);
    if (!validatedUser) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 일치하지 않습니다.',
      );
    }

    const payload = {
      username: validatedUser.username || validatedUser.email,
      sub: validatedUser.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: validatedUser,
    };
  }

  /**
   * 토큰 검증용 페이로드 조회
   */
  async verifyPayload(payload: { sub: number; username: string }) {
    const user: any = await this.userRepository.findOne({
      where: { id: payload.sub } as any,
    });
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
    const { password, ...result } = user;
    return result;
  }
}