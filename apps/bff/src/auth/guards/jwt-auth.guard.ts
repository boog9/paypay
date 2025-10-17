import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const user = request?.user;
    if (!user || typeof user !== 'object') {
      throw new UnauthorizedException('Authentication is required.');
    }
    const candidate = user as { email?: unknown };
    if (typeof candidate.email === 'string' && candidate.email.trim().length > 0) {
      return true;
    }
    throw new UnauthorizedException('Authentication is required.');
  }
}
