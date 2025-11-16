import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { StoresService, AuthenticatedUserContext } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @SkipThrottle()
  listStores(@Req() req: Request) {
    return this.storesService.listStores(this.resolveContext(req));
  }

  @Post()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async createStore(@Body() dto: CreateStoreDto, @Req() req: Request) {
    const idempotencyKey = this.resolveIdempotencyKey(req);
    const context = this.resolveContext(req);
    return this.storesService.provisionStoreForUser(
      context.userId,
      context.email,
      { name: dto.name, defaultCurrency: dto.defaultCurrency },
      idempotencyKey,
    );
  }

  @Get(':storeId')
  @SkipThrottle()
  getStoreSettings(@Req() req: Request, @Param('storeId') storeId: string) {
    return this.storesService.getStoreSettings(this.resolveContext(req), storeId);
  }

  @Put(':storeId')
  @HttpCode(HttpStatus.OK)
  updateStoreSettings(
    @Req() req: Request,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateStoreSettingsDto,
  ) {
    return this.storesService.updateStoreSettings(this.resolveContext(req), storeId, dto);
  }

  @Delete(':storeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStore(@Req() req: Request, @Param('storeId') storeId: string) {
    await this.storesService.deleteStore(this.resolveContext(req), storeId);
  }

  private resolveContext(req: Request): AuthenticatedUserContext {
    const user = (req as { user?: unknown }).user;
    if (!user || typeof user !== 'object') {
      return { userId: null, email: null, bootstrapApiKey: null };
    }
    const candidate = user as {
      id?: unknown;
      email?: unknown;
      bootstrapApiKey?: unknown;
      bootstrapKey?: unknown;
    };
    const userId = typeof candidate.id === 'string' ? candidate.id : null;
    const email = typeof candidate.email === 'string' ? candidate.email : null;
    const bootstrapApiKey =
      typeof candidate.bootstrapApiKey === 'string'
        ? candidate.bootstrapApiKey
        : typeof candidate.bootstrapKey === 'string'
          ? candidate.bootstrapKey
          : null;

    return { userId, email, bootstrapApiKey };
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
