import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_S
} from './auth.constants';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { BtcpayModule } from '../btcpay/btcpay.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_TOKEN_SECRET'),
        signOptions: {
          expiresIn: `${ACCESS_TOKEN_TTL_S}s`,
          issuer: ACCESS_TOKEN_ISSUER,
          audience: ACCESS_TOKEN_AUDIENCE,
          algorithm: ACCESS_TOKEN_ALGORITHM
        },
        verifyOptions: {
          issuer: ACCESS_TOKEN_ISSUER,
          audience: ACCESS_TOKEN_AUDIENCE,
          algorithms: [ACCESS_TOKEN_ALGORITHM]
        }
      })
    }),
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
    BtcpayModule
  ],
  controllers: [AuthController],
  providers: [AuthService, CsrfService, CsrfGuard, JwtAuthGuard, UsersService],
  exports: [AuthService, JwtAuthGuard, UsersService]
})
export class AuthModule {}
