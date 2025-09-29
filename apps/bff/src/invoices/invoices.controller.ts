import { Controller, Get, MethodNotAllowedException, Post } from '@nestjs/common';

@Controller('invoices')
export class InvoicesController {
  @Get()
  getInvoiceCollection() {
    throw new MethodNotAllowedException('Use /tenants/:tenantId/stores/:storeId/invoices');
  }

  @Post()
  createInvoice() {
    throw new MethodNotAllowedException('Use /tenants/:tenantId/stores/:storeId/invoices');
  }
}
