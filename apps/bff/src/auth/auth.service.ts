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
import { AuthResult } from './dto/auth-response.dto';
import { ACCESS_TOKEN_ALGORITHM, ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { normalizeEmail } from './email.utils';

interface RefreshTokenPayload {
  sub: string;
  email: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(dto: RegisterDto): Promise<UserEntity> {
    const email = normalizeEmail(dto.email);
    const exists = await this.usersRepository.exist({ where: { email } });
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });

    const user = this.usersRepository.create({ email, passwordHash });
    return this.usersRepository.save(user);
  }

  async signup(dto: SignupDto): Promise<AuthResult> {
    const user = await this.register(dto);

    return this.issueTokens(user, true);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokens(user, true);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    const refreshToken = dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }
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
    const refreshToken = dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenEntity = await this.refreshTokenRepository.findOne({ where: { id: payload.jti } });
    if (!tokenEntity || tokenEntity.revokedAt) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const matches = await argon2.verify(tokenEntity.tokenHash, refreshToken);
    if (!matches) {
      await this.revokeToken(tokenEntity);
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    await this.revokeToken(tokenEntity);
    return { success: true };
  }

  private async issueTokens(user: UserEntity, revokeExisting: boolean): Promise<AuthResult> {
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
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_TOKEN_SECRET'),
        expiresIn: `${Math.floor(REFRESH_TOKEN_TTL_MS / 1000)}s`,
        jwtid: tokenId,
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        algorithm: ACCESS_TOKEN_ALGORITHM
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
    return this.jwtService.signAsync({ sub: user.id, email: user.email });
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_TOKEN_SECRET'),
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        algorithms: [ACCESS_TOKEN_ALGORITHM]
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
