import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity';
import { IS_PUBLIC_KEY } from '../public.decorator';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// PR-151: VIEWER는 조회만 가능해야 한다(원본 요구). RolesGuard는 @UseGuards(RolesGuard)가
// 붙은 15개 라우트에만 적용되는 opt-in 가드라 "모든 요청에 공통 적용"이라는 요구를 만족할
// 수 없다 — 그래서 이 가드는 app.module.ts에서 JwtAuthGuard 다음 순서로 APP_GUARD 전역
// 등록해 모든 라우트에 적용한다. 기존 15개 @Roles() 사이트의 MANAGER/ADMIN 제한과는
// 완전히 독립적인 규칙이라, 그 사이트들은 손대지 않는다.
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    // user가 없으면(이 가드가 JwtAuthGuard보다 먼저 실행되는 예외적 상황 등) 여기서
    // 막을 일이 아니다 — 인증 자체는 JwtAuthGuard의 책임이다.
    if (!user || user.role !== UserRole.VIEWER) {
      return true;
    }

    if (READ_METHODS.has(request.method)) {
      return true;
    }

    throw new ForbiddenException('조회 전용(VIEWER) 권한으로는 조회만 가능합니다.');
  }
}
