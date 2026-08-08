import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      // 1. Authorization: Bearer <token> 헤더에서 토큰 추출
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // 만료된 토큰 거부
      secretOrKey: 'YOUR_SECRET_KEY', // auth.module.ts의 secret과 동일하게 설정
    });
  }

  // 2. 토큰 검증 성공 시 실행되는 메서드 (payload 데이터를 바탕으로 사용자 조회)
  async validate(payload: { sub: number; email: string }) {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('유효하지 않은 사용자 토큰입니다.');
    }

    // 반환된 객체는 Express req.user 에 자동으로 저장됩니다.
    return user;
  }
}