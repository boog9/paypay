import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { resolveCookieNames } from '../cookie-names';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly cookieNames = resolveCookieNames();

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    if (!request) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const cookies = this.extractCookies(request);

    const token = this.resolveAccessToken(cookies);
    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = await this.authService.verifyAccessToken(token);
    request.user = user;
    return true;
  }

  private extractCookies(req: Request): Record<string, unknown> {
    if (req.cookies && typeof req.cookies === 'object') {
      return req.cookies as Record<string, unknown>;
    }
    return {};
  }

  private resolveAccessToken(cookies: Record<string, unknown>): string | undefined {
    const names = [this.cookieNames.access, ...this.cookieNames.legacyAccess];
    for (const name of names) {
      const raw = cookies[name];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw;
      }
    }
    return undefined;
  }
}
