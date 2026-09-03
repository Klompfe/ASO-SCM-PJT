import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub?: number | string;
  id?: number | string;
  username: string;
  email?: string;
  iat?: number;
  exp?: number;
}

// ConfigModule의 dotenv 로딩보다 이 파일이 먼저 평가될 수 있어 모듈 최상위 상수 대신
// 생성자에서 ConfigService로 런타임에 JWT_SECRET을 읽는다 (super() 이전이라 this는 못 쓰지만
// 생성자 파라미터는 접근 가능).
function resolveJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
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