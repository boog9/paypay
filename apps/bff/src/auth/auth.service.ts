import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Repository, IsNull } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponse } from './dto/auth-response.dto';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

interface RefreshTokenPayload {
  sub: string;
  email: string;
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenTtl = 60 * 15; // 15 minutes
  private readonly refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = this.usersRepository.create({ email: dto.email, passwordHash });
    await this.usersRepository.save(user);

    return this.issueTokens(user, true);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokens(user, true);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const { refreshToken } = dto;
    const payload = await this.verifyRefreshToken(refreshToken);

    const tokenEntity = await this.refreshTokenRepository.findOne({ where: { id: payload.jti } });
    if (!tokenEntity || tokenEntity.revokedAt) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    if (tokenEntity.expiresAt.getTime() <= Date.now()) {
      await this.revokeToken(tokenEntity);
      throw new UnauthorizedException('Refresh token expired.');
    }

    const matches = await argon2.verify(tokenEntity.tokenHash, refreshToken);
    if (!matches) {
      await this.revokeToken(tokenEntity);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const user = await this.usersRepository.findOne({ where: { id: tokenEntity.userId } });
    if (!user) {
      await this.revokeToken(tokenEntity);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    await this.revokeToken(tokenEntity);

    return this.issueTokens(user, false);
  }

  async logout(dto: LogoutDto): Promise<{ success: boolean }> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const tokenEntity = await this.refreshTokenRepository.findOne({ where: { id: payload.jti } });
    if (!tokenEntity || tokenEntity.revokedAt) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const matches = await argon2.verify(tokenEntity.tokenHash, dto.refreshToken);
    if (!matches) {
      await this.revokeToken(tokenEntity);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    await this.revokeToken(tokenEntity);
    return { success: true };
  }

  private async issueTokens(user: UserEntity, revokeExisting: boolean): Promise<AuthResponse> {
    if (revokeExisting) {
      await this.refreshTokenRepository.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user);

    return {
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken
    };
  }

  private async createRefreshToken(user: UserEntity): Promise<string> {
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_TOKEN_SECRET'),
        expiresIn: `${Math.floor(this.refreshTokenTtlMs / 1000)}s`,
        jwtid: tokenId
      }
    );

    const tokenHash = await argon2.hash(refreshToken);
    const entity = this.refreshTokenRepository.create({
      id: tokenId,
      userId: user.id,
      tokenHash,
      expiresAt,
      revokedAt: null
    });
    await this.refreshTokenRepository.save(entity);

    return refreshToken;
  }

  private async signAccessToken(user: UserEntity): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_TOKEN_SECRET'),
        expiresIn: `${this.accessTokenTtl}s`
      }
    );
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_TOKEN_SECRET')
      });
    } catch {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }
  }

  private async revokeToken(tokenEntity: RefreshTokenEntity): Promise<void> {
    tokenEntity.revokedAt = new Date();
    await this.refreshTokenRepository.save(tokenEntity);
  }
}
