import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_TOKEN_COOKIE_NAME } from './auth.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request) {
      return true;
    }

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const headerToken = request.header('x-csrf-token');
    const cookieToken = request.cookies?.[CSRF_TOKEN_COOKIE_NAME];

    if (!headerToken || typeof headerToken !== 'string' || !cookieToken) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    if (headerToken !== cookieToken) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    return true;
  }
}
