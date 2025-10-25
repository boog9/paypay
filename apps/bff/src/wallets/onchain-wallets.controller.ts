import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { OnchainWalletsService } from './onchain-wallets.service';
import { PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';

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
  getConfig(@ReqUser() user: RequestUser, @Param('storeId') storeId: string) {
    return this.walletsService.getConfig({ id: user.id ?? null, email: user.email ?? null }, storeId);
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
