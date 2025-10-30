import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { OnchainWalletsService } from './onchain-wallets.service';
import type { WalletPresenceDto } from './dto/wallet-presence.dto';
import { toWalletPresenceDto } from './dto/wallet-presence.dto';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

@Controller('stores/:storeId/wallets/btc')
export class OnchainWalletsController {
  constructor(private readonly walletsService: OnchainWalletsService) {}

  @Get('presence')
  @UseGuards(JwtAuthGuard)
  @Throttle({ uiBurst: { limit: 600, ttl: seconds(30) } })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async getPresence(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<WalletPresenceDto> {
    const presence = await this.walletsService.getPresence(
      { id: user.id ?? null, email: user.email ?? null },
      storeId
    );

    return toWalletPresenceDto(presence);
  }

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
  @Throttle({ uiBurst: { limit: 600, ttl: seconds(30) } })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  getSummary(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Query('includeConfig') includeConfig?: string
  ) {
    if (typeof includeConfig === 'string' && includeConfig.trim().toLowerCase() === 'true') {
      throw new ForbiddenException('Detailed configuration is not available with this API key.');
    }
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
