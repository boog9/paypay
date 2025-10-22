import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OnchainWalletsService } from './onchain-wallets.service';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

@UseGuards(JwtAuthGuard)
@Controller('stores/:storeId/wallets/btc')
export class OnchainWalletsController {
  constructor(private readonly walletsService: OnchainWalletsService) {}

  @UseGuards(CsrfGuard)
  @Post('preview')
  preview(
    @Param('storeId') storeId: string,
    @Body() dto: PreviewOnchainDto,
    @Req() req: Request
  ) {
    return this.walletsService.preview(this.resolveUserId(req), storeId, dto);
  }

  @Get()
  getConfig(@Param('storeId') storeId: string, @Req() req: Request) {
    return this.walletsService.getConfig(this.resolveUserId(req), storeId);
  }

  @UseGuards(CsrfGuard)
  @Put()
  update(
    @Param('storeId') storeId: string,
    @Body() dto: UpdateOnchainDto,
    @Req() req: Request
  ) {
    return this.walletsService.update(this.resolveUserId(req), storeId, dto);
  }

  private resolveUserId(req: Request): string | null {
    const user = (req as { user?: unknown }).user;
    if (user && typeof user === 'object') {
      const candidate = user as { id?: unknown };
      if (typeof candidate.id === 'string') {
        return candidate.id;
      }
    }
    return null;
  }
}
