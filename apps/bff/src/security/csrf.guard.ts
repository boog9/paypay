import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CsrfService } from './csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXCLUDED_PATHS = [/^\/api\/hooks\/btcpay$/, /^\/hooks\/btcpay$/];

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrfService: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request) {
      return true;
    }

    const method = request.method?.toUpperCase();
    if (method && SAFE_METHODS.has(method)) {
      return true;
    }

    const requestPath = this.extractPath(request);
    if (requestPath && CSRF_EXCLUDED_PATHS.some((pattern) => pattern.test(requestPath))) {
      return true;
    }

    this.csrfService.verify(request);
    return true;
  }

  private extractPath(request: Request): string {
    const originalUrl = request.originalUrl ?? '';
    if (originalUrl) {
      return this.normalizePath(originalUrl);
    }

    const baseUrl = request.baseUrl ?? '';
    const url = request.path ?? request.url ?? '';
    const combined = `${baseUrl}${url}` || url;
    return this.normalizePath(combined);
  }

  private normalizePath(path: string): string {
    if (!path) {
      return '';
    }
    const [cleanPath] = path.split('?');
    return cleanPath;
  }
}
