import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantsService, CreateTenantResult } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateTenantInvoiceDto } from './dto/create-invoice.dto';
import { RotateApiKeyQueryDto } from './dto/rotate-api-key.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  createTenant(@Body() dto: CreateTenantDto, @Req() req: Request): Promise<CreateTenantResult> {
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
    const email = this.resolveUserEmail(req);
    const idempotencyKey = this.resolveIdempotencyKey(req);
    return this.tenantsService.createAdditionalStore(tenantId, dto, actorId, ip, email, idempotencyKey);
  }

  @Get(':tenantId/stores')
  listStores(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Req() req: Request) {
    const email = this.resolveUserEmail(req);
    return this.tenantsService.listTenantStores(tenantId, email);
  }

  @Get(':tenantId/stores/:storeId')
  getStoreSettings(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Req() req: Request
  ) {
    const email = this.resolveUserEmail(req);
    return this.tenantsService.getStoreSettings(tenantId, storeId, email);
  }

  @Post(':tenantId/invoices')
  createInvoice(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateTenantInvoiceDto,
    @Req() req: Request
  ) {
    const email = this.resolveUserEmail(req);
    return this.tenantsService.createInvoice(tenantId, dto, email);
  }

  @Post(':tenantId/apikey/rotate')
  // NestJS v6+: object-based syntax; ttl uses milliseconds (60 seconds)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  rotateApiKey(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: RotateApiKeyQueryDto,
    @Req() req: Request
  ) {
    const actorId = this.resolveActorId(req);
    const email = this.resolveUserEmail(req);
    return this.tenantsService.rotateStoreApiKey(tenantId, query.storeId, actorId, email);
  }

  @Delete(':tenantId/stores/:storeId')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  deleteStore(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Req() req: Request
  ) {
    const actorId = this.resolveActorId(req);
    const ip = this.extractIp(req);
    const email = this.resolveUserEmail(req);
    return this.tenantsService.deleteStore(tenantId, storeId, actorId, ip, email);
  }

  private resolveActorId(req: Request): string | null {
    const user = (req as any).user;
    if (user && typeof user.id === 'string') {
      return user.id;
    }
    return null;
  }

  private resolveUserEmail(req: Request): string | null {
    const user = (req as any).user;
    if (user && typeof user.email === 'string') {
      return user.email;
    }
    return null;
  }

  private extractIp(req: Request): string | null {
    return req.ip ?? null;
  }

  private resolveIdempotencyKey(req: Request): string | null {
    const value = req.header('idempotency-key');
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > 200) {
      throw new BadRequestException('Idempotency-Key header exceeds maximum length of 200 characters.');
    }
    return trimmed;
  }
}
