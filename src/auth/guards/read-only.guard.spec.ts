import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReadOnlyGuard } from './read-only.guard';
import { UserRole } from '../../users/entities/user.entity';

// PR-151: VIEWER는 GET/HEAD/OPTIONS만 통과하고 그 외 메서드는 전부 막는다.
// 다른 역할이나 비로그인 요청, @Public() 라우트는 이 가드가 관여하지 않는다
// (그건 RolesGuard/JwtAuthGuard의 책임).
describe('ReadOnlyGuard (PR-151)', () => {
  let guard: ReadOnlyGuard;
  const reflector = { getAllAndOverride: jest.fn() };

  const buildContext = (method: string, role: UserRole | undefined, isPublic = false): ExecutionContext => {
    reflector.getAllAndOverride.mockReturnValue(isPublic);
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, user: role ? { role } : undefined }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ReadOnlyGuard(reflector as unknown as Reflector);
  });

  it('VIEWER의 GET 요청은 통과한다', () => {
    expect(guard.canActivate(buildContext('GET', UserRole.VIEWER))).toBe(true);
  });

  it('VIEWER의 HEAD/OPTIONS 요청도 통과한다', () => {
    expect(guard.canActivate(buildContext('HEAD', UserRole.VIEWER))).toBe(true);
    expect(guard.canActivate(buildContext('OPTIONS', UserRole.VIEWER))).toBe(true);
  });

  it('VIEWER의 POST/PATCH/DELETE 요청은 ForbiddenException', () => {
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect(() => guard.canActivate(buildContext(method, UserRole.VIEWER))).toThrow(ForbiddenException);
    }
  });

  it('VIEWER가 아닌 역할(ADMIN/MANAGER/USER/OPERATOR)은 어떤 메서드든 이 가드가 막지 않는다', () => {
    for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.OPERATOR]) {
      expect(guard.canActivate(buildContext('DELETE', role))).toBe(true);
    }
  });

  it('user 정보가 없으면(인증 전 등) 이 가드는 관여하지 않고 통과시킨다', () => {
    expect(guard.canActivate(buildContext('DELETE', undefined))).toBe(true);
  });

  it('@Public() 라우트는 VIEWER의 쓰기 요청도 막지 않는다', () => {
    expect(guard.canActivate(buildContext('POST', UserRole.VIEWER, true))).toBe(true);
  });
});
