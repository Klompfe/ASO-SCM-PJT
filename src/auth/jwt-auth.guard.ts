import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('인증 토큰이 누락되었습니다.');
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('올바르지 않은 토큰 형식입니다.');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: 'supersecretkey123',
      });
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }
  }
}