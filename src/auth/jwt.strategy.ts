import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub?: number | string;
  id?: number | string;
  username: string;
  email?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    this.logger.log(`Validating JWT payload for user: ${payload?.username}`);

    if (!payload || (!payload.sub && !payload.id)) {
      this.logger.warn('JWT Payload missing user ID (sub/id)');
      throw new UnauthorizedException('유효하지 않은 토큰 페이로드 구조입니다.');
    }

    const userId = payload.sub || payload.id;

    return {
      userId,
      username: payload.username,
      email: payload.email,
    };
  }
}