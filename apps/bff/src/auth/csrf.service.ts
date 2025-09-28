import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import {
  CSRF_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS
} from './auth.constants';

const CSRF_COOKIE_OPTIONS = {
  httpOnly: false as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: REFRESH_TOKEN_TTL_MS
};

@Injectable()
export class CsrfService {
  issueToken(response: Response): string {
    const token = randomBytes(32).toString('hex');
    response.cookie(CSRF_TOKEN_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
    return token;
  }

  rotateToken(response: Response): string {
    return this.issueToken(response);
  }
}
