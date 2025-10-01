import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
export type RequestWithCsrf = Request & {
  csrfToken?: () => string;
};

@Injectable()
export class CsrfService {
  issueToken(request: RequestWithCsrf, response: Response): string {
    const token = request.csrfToken?.() ?? randomBytes(32).toString('hex');
    response.setHeader('X-CSRF-Token', token);
    // Avoid issuing a duplicate client-readable CSRF cookie: the token is
    // returned via response headers and body for client consumption.
    return token;
  }

  rotateToken(request: RequestWithCsrf, response: Response): string {
    return this.issueToken(request, response);
  }
}
