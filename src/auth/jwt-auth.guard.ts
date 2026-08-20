import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;
      this.logger.error(
        `JWT Authentication failed. Path: ${request.url}, Header: ${
          authHeader || 'None'
        }, Reason: ${
          info?.message || err?.message || 'Invalid or missing token'
        }`,
      );
      throw (
        err ||
        new UnauthorizedException('유효하지 않거나 만료된 인증 토큰입니다.')
      );
    }
    return user;
  }
}