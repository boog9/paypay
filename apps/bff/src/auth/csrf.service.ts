import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import {
  CSRF_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS
} from './auth.constants';

export type RequestWithCsrf = Request & {
  csrfToken?: () => string;
};

const createCsrfCookieOptions = () => ({
  httpOnly: false as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: REFRESH_TOKEN_TTL_MS
});

@Injectable()
export class CsrfService {
  issueToken(request: RequestWithCsrf, response: Response): string {
    const token = request.csrfToken?.() ?? randomBytes(32).toString('hex');
    response.cookie(CSRF_TOKEN_COOKIE_NAME, token, createCsrfCookieOptions());
    return token;
  }

  rotateToken(request: RequestWithCsrf, response: Response): string {
    return this.issueToken(request, response);
  }
}
