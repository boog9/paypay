import { UnprocessableEntityException } from '@nestjs/common';

export type BtcpayValidationPayload = string | Record<string, unknown>;

export class BtcpayValidationException<TPayload extends BtcpayValidationPayload>
  extends UnprocessableEntityException
{
  private readonly normalizedPayload: TPayload;

  constructor(payload: TPayload, options?: { cause?: Error }) {
    super(payload, options);
    this.normalizedPayload = payload;

    Object.defineProperty(this, 'response', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: payload,
    });
  }

  override getResponse(): TPayload {
    return this.normalizedPayload;
  }
}
