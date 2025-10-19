import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
import { resolveCookieNames } from './cookie-names';

@Injectable()
export class CsrfService {
  private readonly cookieNames = resolveCookieNames();
  private readonly pepper: Buffer;
  private readonly cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  };

  constructor(private readonly configService: ConfigService) {
    const pepper = this.configService.getOrThrow<string>('CSRF_PEPPER');
    this.pepper = Buffer.from(pepper, 'base64');
  }

  issueSecret(res: Response): string {
    const secret = randomBytes(32).toString('base64url');
    this.setSecretCookies(res, secret);
    return secret;
  }

  createToken(secret: string): string {
    const hmac = createHmac('sha256', this.pepper);
    hmac.update(secret);
    return hmac.digest('base64url');
  }

  verify(req: Request): void {
    const secret = this.getSecretFromRequest(req);
    const token = this.getTokenFromHeader(req);
    if (!secret || !token) {
      throw new ForbiddenException('invalid csrf token');
    }

    const expected = this.createToken(secret);
    if (!this.safeEquals(expected, token)) {
      throw new ForbiddenException('invalid csrf token');
    }
  }

  getSecretFromRequest(req: Request): string | undefined {
    const cookies = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const bag = cookies as Record<string, unknown>;
    const rawSecret =
      bag[this.cookieNames.csrfSecret] ??
      bag[this.cookieNames.legacyCsrfSecret];
    if (typeof rawSecret !== 'string' || !rawSecret) {
      return undefined;
    }
    return rawSecret;
  }

  private getTokenFromHeader(req: Request): string | undefined {
    const header = req.headers['x-csrf-token'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return typeof header === 'string' ? header : undefined;
  }

  private setSecretCookies(res: Response, secret: string): void {
    res.cookie(this.cookieNames.csrfSecret, secret, this.cookieOptions);
    res.cookie(this.cookieNames.legacyCsrfSecret, secret, this.cookieOptions);
  }

  private safeEquals(expected: string, actual: string): boolean {
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(actual);
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
