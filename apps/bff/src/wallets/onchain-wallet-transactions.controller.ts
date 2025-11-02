import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { ListWalletTxResponse, OnchainTransactionsQueryDto } from './dto/wallet-transactions.dto';
import { OnchainWalletReadService } from './onchain-wallet-read.service';

const transactionsValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
});

@Controller('stores/:storeId/wallets/onchain')
@UseGuards(JwtAuthGuard)
export class OnchainWalletTransactionsController {
  constructor(private readonly wallets: OnchainWalletReadService) {}

  @Throttle({ burst: { limit: 40, ttl: 2_000 } })
  @Header('Cache-Control', 'private, max-age=3')
  @Header('Vary', 'Cookie')
  @Get('transactions')
  @UsePipes(transactionsValidationPipe)
  listTransactions(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Query() query: OnchainTransactionsQueryDto
  ): Promise<ListWalletTxResponse> {
    if (query.cryptoCode !== 'BTC') {
      throw new BadRequestException('Only BTC on-chain wallets are supported.');
    }
    return this.wallets.listTransactions(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      query.cryptoCode,
      query
    );
  }
}
