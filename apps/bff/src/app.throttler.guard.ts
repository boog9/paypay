import { Injectable } from '@nestjs/common';
import { type ThrottlerRequest, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';

type RequestWithUser = Request & {
  user?: {
    id?: string | number;
  };
};

type ResponseWithHeaders = (ServerResponse<IncomingMessage> | Response) & {
  getHeader?: (name: string) => number | string | string[] | undefined;
  setHeader?: (name: string, value: number | string | ReadonlyArray<string>) => void;
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: RequestWithUser): Promise<string> {
    const rawUserId = req.user?.id;
    if (typeof rawUserId === 'string' && rawUserId.length > 0) {
      return Promise.resolve(`uid:${rawUserId}`);
    }
    if (typeof rawUserId === 'number') {
      return Promise.resolve(`uid:${rawUserId.toString()}`);
    }

    const ip = req.ip;
    return Promise.resolve(ip ?? 'unknown');
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const result = await super.handleRequest(requestProps);
    const { context, throttler } = requestProps;
    const { res: rawRes } = this.getRequestResponse(context);
    const res = rawRes as ResponseWithHeaders;
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
