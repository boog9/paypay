import { Controller, Get, Redirect, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stores/:storeId/wallets/bitcoin')
export class LegacyOnchainWalletsController {
  @Get('presence')
  @UseGuards(JwtAuthGuard)
  @Redirect(undefined, 307)
  redirectPresence() {
    // Relative redirect works regardless of global prefix configuration.
    return { url: '../btc/presence' };
  }
}
