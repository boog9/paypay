import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string | null;
  email: string | null;
}

export const ReqUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
  const user = request?.user;

  if (!user || typeof user !== 'object') {
    return { id: null, email: null };
  }

  const candidate = user as { id?: unknown; email?: unknown };
  return {
    id: typeof candidate.id === 'string' ? candidate.id : null,
    email: typeof candidate.email === 'string' ? candidate.email : null
  };
});
