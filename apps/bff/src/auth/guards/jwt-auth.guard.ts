import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { resolveCookieNames } from '../cookie-names';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name, { timestamp: false });
  private readonly cookieNames = resolveCookieNames();

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    if (!request) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const cookies = this.extractCookies(request);
    const cookieKeys = Object.keys(cookies);
    this.logger.debug(`cookie keys: ${cookieKeys.join(',')}`);

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
    const rawToken = cookies[this.cookieNames.access] ?? cookies[this.cookieNames.legacyAccess];
    return typeof rawToken === 'string' && rawToken.trim().length > 0 ? rawToken : undefined;
  }
}
