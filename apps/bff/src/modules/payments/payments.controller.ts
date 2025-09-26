import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@ApiBearerAuth()
@Controller("stores/:storeId/payments")
@UseGuards(AuthGuard("jwt"))
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get("invoices")
  listInvoices(@Param("storeId") storeId: string) {
    return this.paymentsService.listInvoices(storeId);
  }

  @Post("invoices")
  createInvoice(@Param("storeId") storeId: string, @Body() body: Record<string, unknown>) {
    return this.paymentsService.createInvoice(storeId, body);
  }
}
