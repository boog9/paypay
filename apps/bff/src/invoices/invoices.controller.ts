import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  MethodNotAllowedException,
  Post
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BtcpayService } from '../btcpay/btcpay.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('api/invoices')
export class InvoicesController {
  constructor(
    private readonly btcpayService: BtcpayService,
    private readonly configService: ConfigService
  ) {}

  @Get()
  getInvoiceCollection() {
    throw new MethodNotAllowedException('Use POST to create invoices');
  }

  @Post()
  async createInvoice(
    @Body() body: CreateInvoiceDto,
    @Headers('x-store-id') storeIdHeader?: string
  ) {
    const storeId = storeIdHeader ?? this.configService.get<string>('STORE_ID');
    if (!storeId) {
      throw new BadRequestException('Missing store identifier');
    }

    return this.btcpayService.createInvoice(storeId, {
      amount: body.amount,
      currency: body.currency,
      metadata: body.metadata
    });
  }
}
