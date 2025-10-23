import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnchainWalletsService } from './onchain-wallets.service';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

@UseGuards(JwtAuthGuard)
@Controller('stores/:storeId/wallets/btc')
export class OnchainWalletsController {
  constructor(private readonly walletsService: OnchainWalletsService) {}

  @Post('preview')
  preview(
    @Param('storeId') storeId: string,
    @Body() dto: PreviewOnchainDto,
    @Req() req: Request
  ) {
    return this.walletsService.preview(this.resolveUserContext(req), storeId, dto);
  }

  @Get()
  getConfig(@Param('storeId') storeId: string, @Req() req: Request) {
    return this.walletsService.getConfig(this.resolveUserContext(req), storeId);
  }

  @Put()
  @HttpCode(204)
  update(
    @Param('storeId') storeId: string,
    @Body() dto: UpdateOnchainDto,
    @Req() req: Request
  ) {
    return this.walletsService.update(this.resolveUserContext(req), storeId, dto);
  }

  private resolveUserContext(req: Request): { id: string | null; email: string | null } {
    const user = (req as { user?: unknown }).user;
    let id: string | null = null;
    let email: string | null = null;
    if (user && typeof user === 'object') {
      const candidate = user as { id?: unknown; email?: unknown };
      if (typeof candidate.id === 'string') {
        id = candidate.id;
      }
      if (typeof candidate.email === 'string') {
        email = candidate.email;
      }
    }
    return { id, email };
  }
}
