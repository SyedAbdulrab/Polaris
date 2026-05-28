import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedUser, RefreshedRequestUser } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | RefreshedRequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser | RefreshedRequestUser;
  },
);
