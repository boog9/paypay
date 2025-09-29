import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateTenantInvoiceDto } from './dto/create-invoice.dto';
import { RotateApiKeyQueryDto } from './dto/rotate-api-key.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  createTenant(@Body() dto: CreateTenantDto, @Req() req: Request) {
    const actorId = this.resolveActorId(req);
    const ip = this.extractIp(req);
    return this.tenantsService.createTenant(dto, actorId, ip);
  }

  @Post(':tenantId/stores')
  createStore(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateStoreDto,
    @Req() req: Request
  ) {
    const actorId = this.resolveActorId(req);
    const ip = this.extractIp(req);
    return this.tenantsService.createAdditionalStore(tenantId, dto, actorId, ip);
  }

  @Post(':tenantId/invoices')
  createInvoice(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateTenantInvoiceDto
  ) {
    return this.tenantsService.createInvoice(tenantId, dto);
  }

  @Post(':tenantId/apikey/rotate')
  rotateApiKey(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: RotateApiKeyQueryDto,
    @Req() req: Request
  ) {
    const actorId = this.resolveActorId(req);
    return this.tenantsService.rotateStoreApiKey(tenantId, query.storeId, actorId);
  }

  private resolveActorId(req: Request): string | null {
    const user = (req as any).user;
    if (user && typeof user.id === 'string') {
      return user.id;
    }
    return null;
  }

  private extractIp(req: Request): string | null {
    return req.ip ?? null;
  }
}
