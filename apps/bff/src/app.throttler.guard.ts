import { Injectable } from '@nestjs/common';
import { type ThrottlerRequest, ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const uid = req?.user?.id;
    return uid ? `uid:${uid}` : req.ip;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const result = await super.handleRequest(requestProps);
    const { context, throttler } = requestProps;
    const { res } = this.getRequestResponse(context);
    const suffix = throttler.name === 'default' ? '' : `-${throttler.name}`;

    const limit = res.getHeader?.(`X-RateLimit-Limit${suffix}`);
    if (limit !== undefined) {
      res.setHeader?.(`RateLimit-Limit${suffix}`, limit);
    }

    const remaining = res.getHeader?.(`X-RateLimit-Remaining${suffix}`);
    if (remaining !== undefined) {
      res.setHeader?.(`RateLimit-Remaining${suffix}`, remaining);
    }

    const reset = res.getHeader?.(`X-RateLimit-Reset${suffix}`);
    if (reset !== undefined) {
      res.setHeader?.(`RateLimit-Reset${suffix}`, reset);
    }

    return result;
  }
}
