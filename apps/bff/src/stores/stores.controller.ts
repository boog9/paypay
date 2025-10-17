import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { StoresService, AuthenticatedUserContext } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  listStores(@Req() req: Request) {
    return this.storesService.listStores(this.resolveContext(req));
  }

  @Post()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  createStore(@Body() dto: CreateStoreDto, @Req() req: Request) {
    const idempotencyKey = this.resolveIdempotencyKey(req);
    return this.storesService.createStore(dto, this.resolveContext(req), idempotencyKey);
  }

  private resolveContext(req: Request): AuthenticatedUserContext {
    const user = (req as { user?: unknown }).user;
    if (!user || typeof user !== 'object') {
      return { email: null, bootstrapApiKey: null };
    }
    const candidate = user as {
      email?: unknown;
      bootstrapApiKey?: unknown;
      bootstrapKey?: unknown;
    };
    const email = typeof candidate.email === 'string' ? candidate.email : null;
    const bootstrapApiKey =
      typeof candidate.bootstrapApiKey === 'string'
        ? candidate.bootstrapApiKey
        : typeof candidate.bootstrapKey === 'string'
          ? candidate.bootstrapKey
          : null;

    return { email, bootstrapApiKey };
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
