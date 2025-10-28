import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import {
  FeeRateQueryDto,
  ListWalletTransactionsQueryDto,
  ListWalletTxResponse,
  WalletFeeRate,
  WalletOverview,
  WalletReceiveAddress,
  WalletTx,
  WalletUtxo
} from './dto/wallet-transactions.dto';
import { OnchainWalletReadService } from './onchain-wallet-read.service';

@Controller('stores/:storeId/wallets/:cryptoCode')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: OnchainWalletReadService) {}

  @Get('transactions')
  listTransactions(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string,
    @Query() query: ListWalletTransactionsQueryDto
  ): Promise<ListWalletTxResponse> {
    return this.wallets.listTransactions(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      cryptoCode,
      query
    );
  }

  @Get('transactions/:txId')
  getTransaction(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string,
    @Param('txId') txId: string
  ): Promise<WalletTx> {
    return this.wallets.getTransaction(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      cryptoCode,
      txId
    );
  }

  @Get('overview')
  getOverview(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string
  ): Promise<WalletOverview> {
    return this.wallets.getOverview({ id: user.id ?? null, email: user.email ?? null }, storeId, cryptoCode);
  }

  @Get('utxos')
  listUtxos(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string
  ): Promise<WalletUtxo[]> {
    return this.wallets.listUtxos({ id: user.id ?? null, email: user.email ?? null }, storeId, cryptoCode);
  }

  @Get('address')
  getReceiveAddress(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string
  ): Promise<WalletReceiveAddress> {
    return this.wallets.getReceiveAddress(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      cryptoCode
    );
  }

  @Get('feerate')
  getFeeRate(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('cryptoCode') cryptoCode: string,
    @Query() query: FeeRateQueryDto
  ): Promise<WalletFeeRate> {
    return this.wallets.getFeeRate(
      { id: user.id ?? null, email: user.email ?? null },
      storeId,
      cryptoCode,
      query
    );
  }
}
