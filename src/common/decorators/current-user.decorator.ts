import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserContext {
  userId: string;
  tenantId: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof UserContext | undefined, ctx: ExecutionContext): UserContext | string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserContext;

    return data ? user?.[data] : user;
  },
);