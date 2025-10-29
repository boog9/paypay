import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { OnchainWalletsService } from './onchain-wallets.service';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';
import type { Response } from 'express';

@Controller('stores/:storeId/wallets/btc')
export class OnchainWalletsController {
  constructor(private readonly walletsService: OnchainWalletsService) {}

  @Post('preview')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  preview(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() dto: PreviewOnchainDto
  ) {
    const payload = {
      ...dto,
      accountKeyPath: dto.accountKeyPath ?? null
    } as PreviewOnchainDto;

    return this.walletsService.preview(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      payload
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @Throttle({ uiBurst: { limit: 600, ttl: 30 } })
  getSummary(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Query('includeConfig') includeConfig?: string,
    @Res({ passthrough: true }) res?: Response
  ) {
    if (typeof includeConfig === 'string' && includeConfig.trim().toLowerCase() === 'true') {
      throw new ForbiddenException('Detailed configuration is not available with this API key.');
    }
    res?.set('Cache-Control', 'no-store');
    res?.set('Pragma', 'no-cache');
    res?.set('Vary', 'Cookie');
    return this.walletsService.getSummary({ id: user.id ?? null, email: user.email ?? null }, storeId);
  }

  @Put()
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  update(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateOnchainDto
  ) {
    return this.walletsService.update({ id: user.id ?? null, email: user.email ?? null }, storeId, dto);
  }
}
