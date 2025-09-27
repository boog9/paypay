import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Module({
  imports: [JwtModule.register({}), TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity])],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
