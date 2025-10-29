import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

type MaybeUser = { id?: string | null } | undefined;

function clientIp(req: Request): string {
  // works only if trust proxy is enabled
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const cf = (req.headers['cf-connecting-ip'] as string | undefined)?.trim();
  return fwd || cf || (req as any).ip || req.socket.remoteAddress || 'unknown';
}

function routeKey(req: Request): string {
  const base = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
  return base || '/';
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: MaybeUser }): Promise<string> {
    // Skip throttling for preflight
    if (req.method === 'OPTIONS' || req.method === 'HEAD') {
      return 'preflight';
    }
    const uid = (req.user && typeof req.user === 'object' && req.user?.id) ? req.user.id : 'anon';
    const ip = clientIp(req);
    const path = routeKey(req);
    return `${uid}:${ip}:${req.method}:${path}`;
  }
}
