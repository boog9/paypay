import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { AxiosError } from 'axios';

type AxiosPayload = {
  code?: string | null;
  message?: string | null;
  errors?: unknown;
};

function resolveErrorPayload(data: unknown): AxiosPayload {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as AxiosPayload;
  }
  return {};
}

function normalizeCode(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return 'upstream_error';
}

function normalizeMessage(data: AxiosPayload, raw: unknown): string {
  if (typeof data.message === 'string' && data.message.trim().length > 0) {
    return data.message.trim();
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return 'BTCPay error';
}

@Catch()
export class AxiosExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!this.isAxiosError(exception)) {
      super.catch(exception, host);
      return;
    }

    const axiosError: AxiosError<unknown> = exception;
    const status = axiosError.response?.status ?? HttpStatus.BAD_GATEWAY;
    const rawBody = axiosError.response?.data;
    const payload = resolveErrorPayload(rawBody);
    const body = {
      code: normalizeCode(payload.code),
      message: normalizeMessage(payload, rawBody),
      details: payload.errors ?? null,
    };

    const httpException = new HttpException(body, status, {
      cause: axiosError,
    });

    super.catch(httpException, host);
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return typeof error === 'object' && error !== null && 'isAxiosError' in (error as Record<string, unknown>);
  }
}
