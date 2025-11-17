import { Injectable } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { AppThrottlerGuard } from '../../app.throttler.guard';

@Injectable()
export class WriteThrottlerGuard extends AppThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { req } = this.getRequestResponse(requestProps.context);

    const method = typeof req.method === 'string' ? req.method.toUpperCase() : '';
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    return super.handleRequest(requestProps);
  }
}
